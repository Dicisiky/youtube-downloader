import type { Metadata } from 'next';
import { LegalPage } from '../../components/LegalPage';

export const metadata: Metadata = {
  title: 'Terms & Conditions - Dicisiky\'s Livestream Archive',
};

export default function TermsPage() {
  return (
    <LegalPage title="Terms & Conditions" updated="September 2026">
      <p>
        These terms govern your use of Dicisiky's Livestreams Archive. By signing in, you agree to them. If you
        don't agree, please don't use the app.
      </p>

      <h2>What the app does</h2>
      <p>
        The app monitors specified YouTube channels, records their livestreams while they're airing, and re-uploads
        the finished recording to a destination YouTube channel you or an admin has connected. It is an automation
        tool operating on your behalf through the YouTube Data API — it does not host, own, or claim any rights over
        the video content it processes.
      </p>

      <h2>Access &amp; approval</h2>
      <p>
        Signing in with Google creates a pending account. An administrator must approve an account before it can use
        the dashboard. Access can be paused or revoked by an admin at any time, for any reason, including inactivity
        or misuse.
      </p>

      <h2>Acceptable use</h2>
      <ul>
        <li>Only monitor and re-upload content you have the right to record and republish</li>
        <li>Don't use the app to infringe copyright or violate YouTube's Terms of Service or Community Guidelines</li>
        <li>Don't attempt to disrupt, overload, or reverse-engineer the app's infrastructure</li>
      </ul>
      <p>
        Your use of the connected YouTube account(s) remains subject to{' '}
        <a
          href="https://www.youtube.com/t/terms"
          target="_blank"
          rel="noreferrer"
          className="text-indigo-400 hover:text-indigo-300"
        >
          YouTube's Terms of Service
        </a>{' '}
        at all times — the app doesn't override or replace them.
      </p>

      <h2>No warranty</h2>
      <p>
        The app is provided "as is," on a best-effort basis. Livestream recording depends on third-party
        infrastructure (YouTube's own availability, network conditions, the streamer's behavior) outside our
        control, so we can't guarantee that every stream will be captured, finalized, or uploaded successfully.
      </p>

      <h2>Limitation of liability</h2>
      <p>
        To the fullest extent permitted by law, the app's operator is not liable for any indirect, incidental, or
        consequential damages arising from your use of the app, including a missed or failed recording, a failed
        upload, or a loss of access to a connected account.
      </p>

      <h2>Termination</h2>
      <p>
        You can stop using the app at any time by signing out and asking an admin to remove your account. An admin
        may also remove your account or disconnect an upload destination at any time.
      </p>

      <h2>Changes to these terms</h2>
      <p>If these terms change, the "Last updated" date above will reflect it. Continued use after a change means you accept the update.</p>

      <h2>Contact</h2>
      <p>Questions about these terms can be directed to the app administrator.</p>
    </LegalPage>
  );
}
