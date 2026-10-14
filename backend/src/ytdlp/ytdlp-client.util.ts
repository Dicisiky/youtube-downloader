/**
 * yt-dlp's default YouTube player clients for a logged-in session
 * (web_embedded + tv_downgraded) report some livestreams as UNPLAYABLE from
 * this server's datacenter IP -- yt-dlp then fails with a bare "Video
 * unavailable", even though the stream is public and plays fine in a browser.
 * Confirmed by hand on the VPS: the mweb client, with the same cookies,
 * returns the stream's formats normally.
 *
 * Appending mweb after "default" (rather than replacing the defaults) keeps
 * yt-dlp's usual client choice for everything that already works, and only
 * adds mweb as an extra source of formats for the cases where the defaults
 * come back empty.
 *
 * mweb only keeps serving a stream when requests carry a PO token -- without
 * one, YouTube cuts the download off after a minute or two, which shows up as
 * a recording fragmented into hundreds of short segments. `potProviderUrl`
 * points yt-dlp's bgutil PO token plugin (installed in the Docker image) at
 * the bgutil-provider service that mints those tokens. Left unset, the plugin
 * falls back to its own default of http://127.0.0.1:4416.
 */
export function youtubeClientArgs(potProviderUrl?: string): string[] {
  const args = ['--extractor-args', 'youtube:player_client=default,mweb'];
  if (potProviderUrl) {
    args.push('--extractor-args', `youtubepot-bgutilhttp:base_url=${potProviderUrl}`);
  }
  return args;
}
