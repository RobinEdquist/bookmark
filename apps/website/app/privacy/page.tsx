import type { Metadata } from "next";
import Link from "next/link";
import { GITHUB_URL } from "../../components/site-header";

const CONTACT_EMAIL = "privacy@getbookmark.app";
const EFFECTIVE_DATE = "4 August 2026";

export const metadata: Metadata = {
  title: "Privacy Policy for Bookmark",
  description:
    "Privacy policy for the Bookmark iOS and Android apps. The apps collect no personal data and talk only to the server you run yourself.",
};

export default function Privacy() {
  return (
    <section className="shell section-tight legal">
      <p className="kicker kicker-cyan">Legal</p>
      <h1
        className="section-title"
        style={{ fontSize: "clamp(2rem, 4.5vw, 3rem)" }}
      >
        Privacy Policy
      </h1>
      <p className="section-lede">
        For the <strong>Bookmark</strong> apps for iPhone, iPad, and Android.
      </p>
      <p
        className="prose-muted"
        style={{ marginTop: "0.5rem", fontSize: "0.9rem" }}
      >
        Effective {EFFECTIVE_DATE}. Applies to the mobile apps published by
        Robin Edquist.
      </p>

      <div className="note" style={{ marginTop: "2rem" }}>
        <strong>The short version.</strong> I do not collect, receive, store, or
        transmit any of your personal data. The apps contain no analytics, no
        advertising, no tracking, and no crash-reporting services. Bookmark
        connects only to the Bookmark server that you (or whoever runs it) host
        yourself, at the address you enter. Your library, your listening
        history, and your account live on that server and on your device. Never
        with me.
      </div>

      <h2>1. Who is responsible for this app</h2>
      <p>
        The Bookmark mobile apps are published by <strong>Robin Edquist</strong>
        , based in Sweden, in a personal capacity.
      </p>
      <p>
        For questions about this policy, email{" "}
        <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
      </p>

      <h2>2. How Bookmark works, and why that matters here</h2>
      <p>
        Bookmark is a client for a server you run yourself. It is not a
        subscription service, and there is no &ldquo;Bookmark account&rdquo;
        hosted by me. I operate no servers that the apps talk to, and I run no
        hosted version of Bookmark for anyone.
      </p>
      <p>
        When you set the app up, you supply the address of a Bookmark server and
        an access key for it. From then on, the app exchanges data only with
        that server. Because I never sit between you and it, I have no ability
        to see, collect, or retain anything about your library, your reading and
        listening habits, or your identity, even if I wanted to.
      </p>
      <p>
        This also means the operator of the server you connect to (usually you,
        or whoever administers it for your household) is the party responsible
        for the data stored there, including any obligations that follow from
        applicable data-protection law. If you connect to someone else&rsquo;s
        server, ask them how they handle it.
      </p>

      <h2>3. Data I collect</h2>
      <p>
        <strong>None.</strong> To be specific, the apps contain no:
      </p>
      <ul className="prose-list">
        <li>analytics or usage-measurement services;</li>
        <li>advertising, ad identifiers, or advertising networks;</li>
        <li>third-party crash or performance-monitoring services;</li>
        <li>
          tracking across apps or websites, and no use of the iOS Advertising
          Identifier (IDFA);
        </li>
        <li>social-media, marketing, or attribution SDKs;</li>
        <li>
          account registration, newsletter, or contact form operated by me.
        </li>
      </ul>
      <p>
        Nothing you do in the app is reported to me or to any third party. The
        iOS app&rsquo;s privacy manifest declares this formally: tracking is
        disabled and the list of collected data types is empty.
      </p>

      <h2>4. Data stored on your device</h2>
      <p>
        The apps keep the following on your phone or tablet so they can work,
        including offline. All of it stays in the app&rsquo;s private storage on
        your device, and none of it is sent to me:
      </p>
      <ul className="prose-list">
        <li>
          <strong>Your server address and access key</strong>, held in the
          operating system&rsquo;s secure credential store (Keychain on iOS,
          Keystore-backed encrypted storage on Android) rather than in ordinary
          app files.
        </li>
        <li>
          <strong>Playback and reading positions</strong>, plus a queue of
          position updates that have not yet reached your server, so progress
          survives being offline and syncs later.
        </li>
        <li>
          <strong>Books you download for offline use</strong>: the audio or
          ebook files themselves, stored in the app&rsquo;s private area.
        </li>
        <li>
          <strong>Cached cover art and recent responses</strong> from your
          server, so browsing stays fast and does not re-download the same
          images.
        </li>
        <li>
          <strong>Your in-app preferences</strong>, such as playback speed,
          sleep-timer choices, and theme.
        </li>
      </ul>

      <h2>5. Data sent to your server</h2>
      <p>
        To do its job, the app sends your server the things it needs: your
        access key to authenticate, requests for the books and covers you are
        browsing, and your playback or reading position as you go. Your server
        may record that progress so it is available on your other devices; that
        is the point of it.
      </p>
      <p>
        The connection goes directly from your device to the address you
        configured. If that address uses HTTPS, the traffic is encrypted in
        transit. If you point the app at a plain{" "}
        <code className="ui-path">http://</code> address (for example a server
        on your own home network), the traffic is not encrypted, because that is
        a property of the address you chose. Using HTTPS is strongly recommended
        for anything reachable over the internet.
      </p>

      <h2>6. Permissions the apps request</h2>
      <ul className="prose-list">
        <li>
          <strong>Camera (iOS only)</strong>, used solely to scan the setup QR
          code shown by your own Bookmark server, which carries the server
          address and an access key. No photo or video is recorded, stored, or
          transmitted; the camera is used only while that scanner is open. The
          app does not request access to your photo library. On Android, setup
          uses your normal camera app or a link, so the app itself asks for no
          camera permission.
        </li>
        <li>
          <strong>Notifications (Android)</strong>, used to show the playback
          notification with its play, pause, and skip controls, and to report
          the progress of downloads. These are generated locally on your device.
          Neither app uses push notifications, so there is no push token and no
          notification server involved.
        </li>
        <li>
          <strong>Background playback and sync (Android)</strong>:
          foreground-service and wake-lock permissions keep audio playing and
          let downloads and progress syncing finish while the app is not in
          front. Network-state access lets the app tell whether it is online
          before trying to sync.
        </li>
      </ul>

      <h2>7. Third parties</h2>
      <p>
        No third-party service receives your data through the apps. The apps are
        built with standard software libraries (Apple&rsquo;s and Google&rsquo;s
        own frameworks, plus well-known open-source networking and image
        libraries); these run entirely on your device and send nothing to their
        authors.
      </p>
      <p>
        Separately from the apps, the Bookmark <em>server</em> can be configured
        by its operator to look up metadata and cover art from outside sources
        such as Hardcover, Audnexus, Comic Vine, or Goodreads, and to check
        whether a newer version of the server has been released. Those requests
        are made by the server, not by your phone, and are governed by the
        choices of whoever runs it.
      </p>
      <p>
        Because the apps are distributed through the App Store and Google Play,
        Apple and Google act as the distributors and apply their own privacy
        practices to the download, purchase, and update process. If you have
        chosen at the operating-system level to share diagnostic data with Apple
        or Google, those companies may make aggregated, anonymised crash
        statistics available to me as the developer. That comes from the
        platform, not from any code in the app, and it does not identify you.
      </p>

      <h2>8. Keeping and deleting data</h2>
      <p>
        Because I hold nothing, there is nothing on my side to retain or delete.
        You remain in control of everything:
      </p>
      <ul className="prose-list">
        <li>
          <strong>On your device</strong>: signing out clears the stored server
          address and access key, removes your downloaded books, and empties the
          response cache. Individual downloads can also be deleted on their own.
          Uninstalling the app removes everything, including preferences.
        </li>
        <li>
          <strong>On your server</strong>: your library, account, and history
          are managed there, using Bookmark&rsquo;s own administration screens
          or by the person who runs it. Requests to access or erase that data
          have to go to that server&rsquo;s operator; I have no access to it and
          cannot act on such requests.
        </li>
      </ul>

      <h2>9. Children</h2>
      <p>
        The apps are not directed at children under 13, and I do not knowingly
        collect any information from anyone, of any age, because I collect no
        information at all. The content available in an app is whatever exists
        in the library of the server it connects to, which is controlled by that
        server&rsquo;s operator.
      </p>

      <h2>10. Your rights</h2>
      <p>
        Data-protection laws such as the GDPR and the CCPA give you rights over
        personal data that a company holds about you. I hold none, so there is
        nothing for me to disclose, correct, export, delete, or restrict, and I
        have nothing to sell; I do not and will not sell personal data.
      </p>
      <p>
        Where your personal data does exist is on the device in your hand and on
        the server you connect to. You can exercise complete control over the
        first by using the app&rsquo;s own settings or uninstalling it, and over
        the second by administering that server or contacting whoever does.
      </p>

      <h2>11. Changes to this policy</h2>
      <p>
        If the apps ever change in a way that affects this policy, I will update
        this page and revise the effective date above. Should a future version
        ever collect data (which is not the plan), that change would be
        described here, and in the App Store and Google Play privacy
        disclosures, before it took effect.
      </p>

      <h2>12. Contact</h2>
      <p>
        Email <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> with any
        question about this policy, including anything you would like clarified
        about how the apps handle your data. The Bookmark server that the apps
        connect to is open source and can be reviewed on{" "}
        <a href={GITHUB_URL}>GitHub</a>.
      </p>

      <p style={{ marginTop: "2.5rem" }}>
        <Link href="/" className="link-arrow">
          Back to getbookmark.app
        </Link>
      </p>
    </section>
  );
}
