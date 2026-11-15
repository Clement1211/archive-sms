---
layout: site
lang: en
title: Create an SMS backup with SMS Backup & Restore
permalink: /en/guides/create-sms-backup-android/
description: A beginner’s guide to creating an SMS and MMS XML export with SMS Backup & Restore on Android, then opening it in SMS Archive.
brand: SMS Archive
nav_label: Main navigation
nav_guides: Guides
nav_about: About
language_label: Français
language_url: /guides/creer-sauvegarde-sms-android/
app_label: Open the reader
guides_url: /en/guides/
about_url: /en/about/
privacy_url: /en/privacy/
contact_url: /en/contact/
nav_privacy: Privacy
nav_contact: Contact
footer_label: Information
footer_note: Your archive stays on this device.
skip: Skip to content
---
<section class="page-hero"><p class="eyebrow">BEGINNER GUIDE · ANDROID</p><h1>Create an SMS backup with SMS Backup &amp; Restore</h1><p class="lead">Don’t have a file to import yet? First create an XML backup on the Android phone that has your messages.</p></section>
<article class="article">
  <h2>Before you start</h2>
  <p>SMS Backup &amp; Restore runs on Android. Install the official app from <a href="https://play.google.com/store/apps/details?id=com.riteshsahu.SMSBackupRestore" rel="noopener noreferrer">Google Play</a> on the phone that has the messages.</p>
  <p>Screen names can vary slightly by app and Android version. This site needs an XML messages backup. Call logs are optional.</p>

  <h2>1. Start a new backup</h2>
  <p>Open SMS Backup &amp; Restore and tap <strong>Backup</strong>. If prompted, allow access to SMS. Also allow access to contacts if you want the names saved on the phone included.</p>

  <h2>2. Choose messages and MMS</h2>
  <p>Select SMS messages. To include photos, videos, and MMS group conversations, check that MMS is enabled under <strong>Menu → Settings → Backup Settings → Turn on MMS</strong> (labels may be translated in your app).</p>

  <h2>3. Keep the backup on your phone</h2>
  <p>Choose a local backup on the device. The app creates an XML file; its exact location depends on the app settings and Android version. You can share it from inside the app after it is created.</p>

  <h2>4. Wait for it to finish, then share the file</h2>
  <p>Start the backup and wait for the success message. Then open <strong>Menu → View backups</strong>, choose the <strong>Local</strong> tab, tap the ⋮ menu next to the backup, and choose <strong>Send File</strong>. Select a transfer method, such as Google Drive or another sharing option available on your devices.</p>
  <p>For a large file, avoid email attachments, which may have size limits. If you use cloud storage to transfer it, the file will be stored there according to that service’s settings.</p>

  <h2>5. Download the XML to the device where you’ll read it</h2>
  <p>On iPhone, find or download the file in the <strong>Files</strong> app. On Mac or computer, save it somewhere easy to find. Keep the <strong>.xml</strong> file extension.</p>

  <h2>6. Import it into SMS Archive</h2>
  <p>Read <a href="{{ '/en/guides/read-sms-backup-on-iphone/' | relative_url }}">the iPhone guide</a> to transfer and import the file, or open the <a href="{{ '/app/' | relative_url }}">SMS Archive reader</a>, tap Import, and choose the XML file.</p>

  <h2>If a conversation or MMS is missing</h2>
  <p>Check that the app has SMS permission, contacts are allowed if you want contact names, and MMS is enabled for media and group chats. SMS Archive can only display data included in the XML file.</p>
  <p>See the <a href="https://www.synctech.com.au/sms-backup-restore/sms-faqs/" rel="noopener noreferrer">official SyncTech FAQ</a> or the <a href="https://play.google.com/store/apps/details?id=com.riteshsahu.SMSBackupRestore" rel="noopener noreferrer">SMS Backup &amp; Restore listing on Google Play</a>.</p>
</article>
