import { storedAccessToken } from 'tt-backend';

// Whether this device had a saved sign-in when the app opened (read once, so
// the first screen knows whether to check it). The Supabase client itself
// handles ?clear_access_token=true.
export const appParams = {
  token: storedAccessToken(),
};
