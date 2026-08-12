# GitHub to Lovable Auto-Deployment Setup

This guide helps you set up automatic deployment from GitHub to Lovable.

## Option 1: Lovable Webhook (Recommended)

### Step 1: Get your Lovable Webhook URL

1. Go to your [Lovable Dashboard](https://lovable.dev)
2. Navigate to your project settings
3. Find the "Webhooks" or "Integrations" section
4. Create a new webhook for GitHub pushes
5. Copy the webhook URL (it should look like: `https://api.lovable.dev/projects/xxx/deploy/webhook`)

### Step 2: Add Webhook URL to GitHub Secrets

1. Go to your GitHub repository settings
2. Navigate to **Settings → Secrets and variables → Actions**
3. Click **New repository secret**
4. Name: `LOVABLE_DEPLOY_WEBHOOK_URL`
5. Value: Paste your Lovable webhook URL
6. Click **Add secret**

### Step 3: Test the Setup

1. Push any change to your main branch
2. Go to the **Actions** tab in your GitHub repository
3. You should see the "Deploy to Lovable" workflow running
4. Check the workflow logs to confirm the webhook was called successfully

## Option 2: Lovable CLI Deployment

If you prefer using the Lovable CLI instead of webhooks:

### Step 1: Install Lovable CLI

```bash
npm install -g @lovable.dev/cli
# or
bun install -g @lovable.dev/cli
```

### Step 2: Authenticate with Lovable

```bash
lovable login
```

### Step 3: Add Lovable API Token to GitHub Secrets

1. Get your API token from Lovable dashboard
2. Add it as `LOVABLE_API_TOKEN` in GitHub Secrets
3. Update the workflow file to use CLI instead of webhook

## Option 3: Lovable GitHub Integration (Easiest)

If Lovable offers direct GitHub integration:

1. Go to your Lovable Dashboard
2. Look for "GitHub" or "Git Integration" in settings
3. Connect your GitHub repository
4. Enable "Auto-deploy on push to main"
5. This will handle everything automatically

## Current Setup

Your project now has a GitHub Action workflow at `.github/workflows/deploy-lovable.yml` that:

✅ Triggers on every push to `main` branch
✅ Builds the project with Bun
✅ Calls your Lovable webhook to trigger deployment
✅ Can also be triggered manually from GitHub Actions UI

## Troubleshooting

**Webhook not being called:**
- Check that `LOVABLE_DEPLOY_WEBHOOK_URL` is set in GitHub Secrets
- Verify the webhook URL is correct
- Check workflow logs for error messages

**Build failures:**
- Ensure all dependencies are installed correctly
- Check that the build passes locally with `npm run build`
- Review build logs in GitHub Actions

**Deployment not updating:**
- Verify the webhook is triggering deployments in Lovable
- Check Lovable dashboard for deployment logs
- Ensure your Lovable project is connected to the correct repository

## Workflow Status

After setup, you can monitor deployments at:
- GitHub: Repository → Actions tab
- Lovable: Dashboard → Deployments section

Each push to main will automatically trigger a new deployment!
