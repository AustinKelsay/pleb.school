# GitHub OAuth Setup for Account Linking

To enable GitHub account linking, you need to update your GitHub OAuth App settings:

## Required Callback URLs

Your GitHub OAuth App needs to include BOTH of these callback URLs:

1. **For NextAuth Sign-in**: `http://localhost:3000/api/auth/callback/github`
2. **For Account Linking**: `http://localhost:3000/api/account/oauth-callback`

For production, replace `http://localhost:3000` with your production URL.

## How to Update

1. Go to GitHub Settings > Developer settings > OAuth Apps
2. Select your OAuth app
3. In the "Authorization callback URL" field, you can only have one URL
4. Since GitHub only allows one callback URL per app, you have two options:

### Option A: Use Two Separate GitHub OAuth Apps (Recommended)
- Keep your existing app for NextAuth sign-in
- Create a new GitHub OAuth App specifically for account linking
- Set the callback URL to: `http://localhost:3000/api/account/oauth-callback`
- Update your `.env` file with separate credentials:
  ```
  # For NextAuth sign-in
  GITHUB_CLIENT_ID=your_signin_client_id
  GITHUB_CLIENT_SECRET=your_signin_client_secret
  
  # For account linking (new variables needed)
  GITHUB_LINK_CLIENT_ID=your_linking_client_id
  GITHUB_LINK_CLIENT_SECRET=your_linking_client_secret
  ```

### Option B: Use a Proxy Callback (Alternative)
- Keep the NextAuth callback URL as your primary
- Modify the NextAuth GitHub provider to handle linking state
- This requires custom callback handling in NextAuth configuration

## Current Implementation

The current implementation expects the callback URL to be:
`http://localhost:3000/api/account/oauth-callback`

This is handled by `/api/account/oauth-callback/route.ts` which:
1. Validates the OAuth response
2. Exchanges the code for an access token
3. Fetches the GitHub user profile
4. Links the GitHub account to the existing user

## Testing

After updating your GitHub OAuth App:
1. Sign in with a non-GitHub provider (email, Nostr)
2. Go to Profile > Accounts tab
3. Click "Link GitHub"
4. You should be redirected to GitHub for authorization
5. After authorizing, you'll be redirected back and the account will be linked