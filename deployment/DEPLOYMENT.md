# RISO HUB — Deployment Guide

## Architecture

```
┌─────────────────┐     ┌──────────────────────────────────────────────────┐
│  Vercel (EU)    │────▶│  Render (Frankfurt)                              │
│  React frontend │     │  ┌──────────────┐  ┌──────────────────────────┐ │
│  risohub.vercel │     │  │  API service │  │  Worker services         │ │
│  .app           │     │  │  Node/Express│  │  email / drive / workflow│ │
└─────────────────┘     │  └──────┬───────┘  └──────────────────────────┘ │
                        │         │                                         │
                        │  ┌──────▼───────┐  ┌──────────────────────────┐ │
                        │  │  PostgreSQL  │  │  CloudAMQP (RabbitMQ)    │ │
                        │  │  Render DB   │  │  External managed service│ │
                        │  └──────────────┘  └──────────────────────────┘ │
                        └──────────────────────────────────────────────────┘
                                   │
                        ┌──────────▼───────────────────────────────────────┐
                        │  External services                               │
                        │  AWS S3 · SendGrid · Google Drive · HubSpot     │
                        │  EPC Register · Firebase (Phase 2)              │
                        └──────────────────────────────────────────────────┘
```

---

## Prerequisites

- GitHub repo with RISO HUB code
- Render account (render.com)
- Vercel account (vercel.com)
- CloudAMQP account — free tier works (cloudamqp.com)
- AWS account with S3 bucket in eu-west-2
- SendGrid account with verified sender domain
- Google Cloud service account with Drive API enabled
- EPC API account (epc.opendatacommunities.org)

---

## Step 1 — Set up CloudAMQP (RabbitMQ)

1. Create a free CloudAMQP instance (Little Lemur tier — sufficient for this workload)
2. Select region: **EU-West (Ireland)**
3. Copy the AMQPS URL — you'll need it as `RABBITMQ_URL`

---

## Step 2 — Set up AWS S3

1. Create bucket: `risohub-files-production` in `eu-west-2`
2. Block all public access ✓
3. Enable server-side encryption (SSE-S3) ✓
4. Create IAM user with policy:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"],
      "Resource": "arn:aws:s3:::risohub-files-production/*"
    }
  ]
}
```

5. Generate access key — save as `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY`

For audit log WORM policy, add a lifecycle rule to block deletions on the `audit-logs/` prefix.

---

## Step 3 — Set up Google Drive (service account)

1. In Google Cloud Console, create a project
2. Enable the Google Drive API
3. Create a service account, download the JSON key
4. Base64 encode it: `base64 -i service-account.json | tr -d '\n'`
5. Save as `GOOGLE_SERVICE_ACCOUNT_JSON`
6. Create a shared Drive folder, share it with the service account email
7. Copy the folder ID from the URL — save as `GOOGLE_DRIVE_ROOT_FOLDER_ID`

---

## Step 4 — Deploy backend to Render

1. Push code to GitHub
2. In Render dashboard → **New** → **Blueprint**
3. Connect your GitHub repo — Render auto-detects `render.yaml`
4. Review services: API + 3 workers + 3 cron jobs + PostgreSQL
5. Click **Apply** — Render creates all services
6. In each service, go to **Environment** and fill in the `sync: false` variables:
   - `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_S3_BUCKET`
   - `SENDGRID_API_KEY`, `SENDGRID_FROM_EMAIL`
   - `GOOGLE_SERVICE_ACCOUNT_JSON`, `GOOGLE_DRIVE_ROOT_FOLDER_ID`
   - `HUBSPOT_ACCESS_TOKEN`
   - `EPC_API_EMAIL`, `EPC_API_KEY`
   - `RABBITMQ_URL` (CloudAMQP AMQPS URL)
   - `SERVICE_TOKEN` (generate: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`)
7. The API service will run migrations automatically on first deploy

**API URL** — once deployed, Render gives you a URL like:
`https://risohub-api.onrender.com`

---

## Step 5 — Deploy frontend to Vercel

1. In Vercel dashboard → **Add New Project**
2. Import your GitHub repo
3. Framework: **Vite**
4. Build command: `npm run build`
5. Output directory: `dist`
6. Add environment variables:
   - `VITE_API_URL` = `https://risohub-api.onrender.com`
   - `VITE_APP_NAME` = `RISO HUB`
7. Deploy

**Frontend URL** — Vercel gives you `https://risohub-xxxx.vercel.app`
Set a custom domain under Settings → Domains if needed.

---

## Step 6 — Update CORS and FRONTEND_URL

1. In Render, update `FRONTEND_URL` on the API service to your Vercel URL
2. Redeploy the API service

---

## Step 7 — Seed initial data

SSH into Render shell or run via the Render dashboard shell:

```bash
node dist/seeds/001-seed.ts
```

This creates the default Admin user and seeds MIS 3005 checklist items.
Default admin credentials are logged to console on first seed — change immediately.

---

## Local development

```bash
# 1. Start infrastructure
docker compose up -d

# 2. Copy env
cp .env.example .env
# Fill in values — local DB and RabbitMQ are pre-configured

# 3. Install dependencies
npm install

# 4. Run migrations
npm run migrate

# 5. Seed
npm run seed

# 6. Start API (with hot reload)
npm run dev

# 7. In a separate terminal — start frontend
cd frontend && npm install && npm run dev
```

API: http://localhost:3001
Frontend: http://localhost:3000
RabbitMQ UI: http://localhost:15672 (risohub / password)
pgAdmin: `docker compose --profile tools up` → http://localhost:5050

---

## Production checklist

- [ ] All `sync: false` env vars filled in Render dashboard
- [ ] `FRONTEND_URL` set to Vercel URL
- [ ] S3 bucket encryption enabled
- [ ] S3 WORM lifecycle rule on `audit-logs/` prefix
- [ ] SendGrid sender domain verified (SPF + DKIM)
- [ ] Custom domain set up on Vercel
- [ ] EPC API key registered and tested
- [ ] Admin account password changed after first seed
- [ ] 2FA enabled on Admin account
- [ ] Render PostgreSQL automatic backups confirmed (enabled by default on Standard plan)
- [ ] CloudAMQP message persistence enabled

---

## Monitoring

- **Render dashboard** — service health, deploy logs, CPU/memory
- **RabbitMQ management UI** (CloudAMQP) — queue depths, message rates
- **Vercel analytics** — frontend performance
- **AWS CloudWatch** — S3 access logs (enable in S3 bucket settings)
- **SendGrid Activity Feed** — email delivery status
