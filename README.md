# Hop Skip Jump

Wordle, but for numbers. One player sets a 3–8 digit number (or lets the app
generate one nobody sees), the other guesses it, and every guess comes back
marked digit by digit:

| Mark | Name | Meaning | Colour |
| --- | --- | --- | --- |
| `J` | **Jump** | right digit, right spot | green |
| `S` | **Skip** | right digit, wrong spot | yellow |
| `H` | **Hop**  | digit isn't in the number | gray |

A digit bank across 0–9 tracks what's been learned, graying out and striking
through any digit ruled out entirely.

## Rules as implemented

- **Length**: 3 to 8 digits.
- **Guesses**: `max(6, length + 3)` — six for a 3-digit number, eleven for eight.
- **Leading zeros** are legal. The secret is a digit sequence, not a numeric
  value, so `007` is a valid 3-digit number and the random generator can produce it.
- **Repeated digits** use Wordle's two-pass scoring: exact matches are claimed
  first, then a misplaced digit only earns a Skip while unclaimed copies of it
  remain. Secret `4417` guessed as `4444` scores `J J H H`, not `J J S S`.

## Local development

```sh
npm install
npm run dev      # dev server
npm test         # scoring unit tests + render check
npm run build    # production build into dist/
```

## Deploying

Two templates. You deploy the first one once by hand; it deploys the second one
on every push.

```
infra/pipeline.yaml   CodePipeline + CodeBuild + IAM  (you deploy this, once)
infra/site.yaml       S3 bucket + CloudFront + OAC    (the pipeline deploys this)
```

Everything goes in **us-east-1**, because CloudFront only reads its viewer
certificate from that region and the pipeline's CloudFormation stage deploys into
the pipeline's own region.

### 1. Create the GitHub connection

The OAuth handshake can't be done from CloudFormation, so this one step is manual:

```sh
aws codeconnections create-connection \
  --provider-type GitHub \
  --connection-name hopskipjump \
  --region us-east-1
```

Then open the CodePipeline console → Settings → Connections, click the new
connection, and **Update pending connection** to authorize it against GitHub. It
must reach `AVAILABLE` before the pipeline will run. Note the ARN.

### 2. Create the certificate

DNS lives outside AWS, so request a DNS-validated cert and add the validation
CNAMEs at your DNS provider by hand:

```sh
aws acm request-certificate \
  --domain-name hopskipjump.claytondavis.dev \
  --subject-alternative-names hsj.claytondavis.dev \
  --validation-method DNS \
  --region us-east-1

aws acm describe-certificate \
  --certificate-arn <arn> \
  --region us-east-1 \
  --query 'Certificate.DomainValidationOptions[].ResourceRecord'
```

Add those CNAME records, wait for the cert to reach `ISSUED`, and keep the ARN.

### 3. Deploy the pipeline

```sh
aws cloudformation deploy \
  --region us-east-1 \
  --stack-name hopskipjump-pipeline \
  --template-file infra/pipeline.yaml \
  --capabilities CAPABILITY_IAM \
  --parameter-overrides \
      ConnectionArn=<connection arn> \
      CertificateArn=<certificate arn> \
      RepositoryId=<owner>/hopskipjump \
      BranchName=main
```

The pipeline triggers itself on the first push, and on every push to
`BranchName` after that. Its stages:

1. **Source** — pulls the branch through the CodeConnections connection.
2. **Build** — `npm ci`, `npm test`, `npm run build`; emits `dist/` plus
   `infra/site.yaml` as the build artifact.
3. **Infrastructure** — deploys `infra/site.yaml` as the `hopskipjump-site`
   stack, so bucket and CDN changes ship the same way code does.
4. **Publish** — syncs `dist/` to the bucket and invalidates CloudFront.

Hashed assets are uploaded `immutable` with a one-year max-age; `index.html` is
uploaded `no-cache` so a deploy is visible immediately.

### 4. Point DNS at CloudFront

After the first successful run, read the distribution hostname:

```sh
aws cloudformation describe-stacks \
  --region us-east-1 \
  --stack-name hopskipjump-site \
  --query "Stacks[0].Outputs[?OutputKey=='DistributionDomainName'].OutputValue" \
  --output text
```

Point both names at it with CNAMEs:

```
hopskipjump.claytondavis.dev.  CNAME  dxxxxxxxxxxxxx.cloudfront.net.
hsj.claytondavis.dev.          CNAME  dxxxxxxxxxxxxx.cloudfront.net.
```

Both are subdomains, so plain CNAMEs are fine — no ALIAS/ANAME needed.

## Analytics

Google Analytics 4, property `G-VCEH55VD4G`. The integration is entirely in
`src/analytics.js`; `index.html` deliberately does **not** carry Google's inline
snippet, because an inline `<script>` would force `script-src 'unsafe-inline'`
into the CSP. The module injects `gtag.js` as an external script instead, so
naming the `googletagmanager.com` host in `infra/site.yaml` is enough.

Only production builds report. `npm run dev` logs events to the console as
`[analytics] <event> {...}` instead of loading the tag, so the property never
sees local play. Override the ID with `VITE_GA_ID` at build time, or set it to
an empty string to build with analytics off.

### Events

Beyond the automatic `page_view`, every game sends:

| Event | When | Parameters |
| --- | --- | --- |
| `game_start` | a number is set or generated | `digits`, `max_guesses`, `secret_source` (`custom`/`random`) |
| `guess_submitted` | each scored guess | `digits`, `guess_number`, `jumps`, `skips`, `hops` |
| `game_won` | the guess matched | `digits`, `guesses_used`, `max_guesses` |
| `game_lost` | the last guess missed | `digits`, `guesses_used`, `max_guesses` |
| `number_revealed` | "Reveal the number" | `digits`, `guesses_used` |
| `game_quit` | "Quit game" | `digits`, `guesses_used`, `result` (`won`/`lost`) |

So "how many games were played" is the `game_start` count, "how many digits" is
its `digits` breakdown, and "how many guesses" is `guesses_used` on
`game_won`/`game_lost` (or the `guess_submitted` count for raw volume).

### One-time setup in the GA console

GA4 collects these parameters immediately but will not report on them until they
are registered. Dimensions group reports, metrics get summed and averaged, and
**a given parameter name can only be one or the other** — GA rejects a metric
whose parameter is already a dimension. So pick per parameter by the question you
want it to answer. Under **Admin → Data display → Custom definitions**:

- **Custom dimensions** (scope *Event*): `digits`, `guesses_used`,
  `secret_source`, `result`. These are the cuts worth breaking reports down by —
  `digits` gives games by length, and `guesses_used` gives the Wordle-style
  distribution of how many guesses a game took. A distribution is strictly more
  informative than an average here: the mean is readable off it, the shape isn't
  recoverable from the mean.
- **Custom metrics** (scope *Event*, unit *Standard*): `max_guesses`,
  `guess_number`, `jumps`, `skips`, `hops`.

If an averageable *metric* for one of those dimensions is wanted later, the fix
is a second parameter carrying the same value under a different name — not a
re-registration, which GA will refuse.

Registration is not retroactive — parameters only appear in reports from the day
they are registered, so do this before caring about the numbers. Data takes up
to 24–48 hours to surface in standard reports; **Reports → Realtime** and
**Explore** show events right away, which is the fastest way to confirm the tag
is live after a deploy.

## Notes on the infrastructure

- The bucket is fully private. CloudFront reaches it through an Origin Access
  Control, and the bucket policy only trusts requests carrying this
  distribution's ARN.
- `403`/`404` both return `/index.html` with a `200`, so client-side routes work
  if the app ever grows any.
- The site bucket is `Retain` on delete and versioned with a 30-day noncurrent
  expiry, so tearing the stack down doesn't destroy the bucket.
- `BuildImage` and `NodeVersion` are stack parameters. If the CodeBuild image
  stops shipping the pinned Node runtime, bump them rather than editing
  `buildspec.yml`.
- IAM is scoped by deriving the bucket name from the stack name
  (`<SiteStackName>-<account>`), which lets the build role be written
  against a bucket that doesn't exist yet. CloudFront actions can't be scoped to
  a distribution that CloudFormation hasn't created, so those stay on `*`.
