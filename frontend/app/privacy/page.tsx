import type { Metadata } from 'next';
import { LegalPage } from '../../components/LegalPage';

export const metadata: Metadata = {
  title: 'Privacy Policy - Dicisiky\'s Livestream Archive',
};

export default function PrivacyPolicyPage() {
  return (
    <LegalPage title="Privacy Policy" updated="September 2026">
      <p>
        Dicisiky's Livestreams Archive ("the app") monitors YouTube channels for livestreams, records them, and re-uploads the
        finished recordings to a destination YouTube channel on your behalf. This page explains what data the app
        collects, why, and how it's used.
      </p>

      <h2>Information we collect</h2>
      <p>When you sign in with Google, we receive and store:</p>
      <ul>
        <li>Your Google account email address, name, and profile picture</li>
        <li>An internal approval status (pending / approved / rejected) tied to that account</li>
      </ul>
      <p>When an admin connects a YouTube channel as an upload destination, the app additionally stores:</p>
      <ul>
        <li>OAuth2 access and refresh tokens for that YouTube channel, issued by Google</li>
        <li>The destination channel's public name and thumbnail</li>
      </ul>
      <p>
        The app does not collect passwords — authentication is handled entirely by Google. A signed session cookie
        (httpOnly, not readable by page scripts) keeps you signed in between visits.
      </p>

      <h2>How this data is used</h2>
      <ul>
        <li>Your email and approval status gate access to the dashboard</li>
        <li>Stored OAuth tokens are used only to upload recorded livestreams to the destination channel you connected</li>
        <li>Nothing collected here is used for advertising, analytics, or profiling</li>
      </ul>

      <h2>Recorded content</h2>
      <p>
        Livestreams recorded through the app are temporarily stored on the server while processing, then uploaded to
        the configured destination YouTube channel. Once an upload succeeds, the local copy is deleted; it is not
        kept, sold, or shared elsewhere.
      </p>

      <h2>Third-party services</h2>
      <p>
        The app uses Google's Sign-In and the YouTube Data API to operate. Your use of these features is also
        subject to{' '}
        <a
          href="https://policies.google.com/privacy"
          target="_blank"
          rel="noreferrer"
          className="text-indigo-400 hover:text-indigo-300"
        >
          Google's Privacy Policy
        </a>{' '}
        and{' '}
        <a
          href="https://www.youtube.com/t/terms"
          target="_blank"
          rel="noreferrer"
          className="text-indigo-400 hover:text-indigo-300"
        >
          YouTube's Terms of Service
        </a>
        .
      </p>

      <h2>Data retention &amp; deletion</h2>
      <p>
        Account and upload-destination data is kept for as long as your account or the connected destination exists
        in the app. To request deletion of your account data or revocation of a connected channel's access, contact
        the administrator — removing a channel or account in the console immediately revokes its stored tokens.
      </p>

      <h2>Security</h2>
      <p>
        All traffic to the app is served over HTTPS. Session cookies are httpOnly and scoped to this domain; OAuth
        tokens are stored server-side and never exposed to the browser.
      </p>

      <h2>Changes to this policy</h2>
      <p>If this policy changes, the "Last updated" date above will reflect it.</p>

      <h2>Contact</h2>
      <p>Questions about this policy can be directed to the app administrator.</p>
    </LegalPage>
  );
}
