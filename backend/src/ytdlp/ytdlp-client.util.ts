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
 */
export const YOUTUBE_CLIENT_ARGS = ['--extractor-args', 'youtube:player_client=default,mweb'];
