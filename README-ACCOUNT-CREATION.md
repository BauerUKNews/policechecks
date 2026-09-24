# Add Owen-managed accounts

This update lets Owen create a confirmed account with a temporary password from the existing **Account access & writing** area. The new user can sign in straight away, change their password from **Change password**, and Owen can later pause or revoke the account in the same user list.

The Supabase setup has now been completed in your live project: the `provision-user` function is deployed with its own user/admin checks, **Verify JWT with legacy secret** is off for that function, public sign-up is off, and email confirmation remains on. No new SQL or Supabase setup is left for this project.

## Supabase setup (already completed)

The function source and Supabase configuration are included as a backup. If you later restore this feature in a different Supabase project, deploy the function named `provision-user`, turn **Verify JWT** off for it, and turn off **Allow new users to sign up** while leaving email confirmation enabled. The function checks the signed-in user with Supabase Auth and Owen’s administrator permission itself. Supabase supplies its private server key to the function; do not paste that key into the website or GitHub.

## The one remaining step: upload the website files

1. Extract this update ZIP.
2. Upload the extracted website files to the top level of the existing `police.checks` GitHub repository, replacing files with the same names. Keep `index.html` and `data.html` at the repository top level, and include the `vendor` and `supabase` folders.
3. Commit the upload and wait for GitHub Pages to finish publishing.

## Create a user after GitHub Pages updates

Sign in as Owen, open **Account access & writing → Create an account**, enter the person's email and a temporary password of at least 12 characters, and select **Create account**. The function confirms the email and approves this new user without sending an email. Share the temporary password through a secure channel. The user can change it after signing in. Use **Revoke access** in the account list whenever access should end.

No SQL migration, publisher change, scraper restart, or change on the other Mac is needed. No private key is included in this update.
