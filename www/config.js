/* config.js — set once by the administrator, then every installed app (APK and PC web app) connects to the team cloud by itself.
 * cloudUrl: Apps Script web app URL (ends with /exec). Empty = each user types it in More > Cloud (or "demo").
 * updateRepo: GitHub "owner/repository" whose Releases hold the latest APK (used by the phone app's update check).
 * Design & Developed by Md. Saiful Islam */
window.LRM_CONFIG = {
  cloudUrl: "https://script.google.com/macros/s/AKfycbz7Wx8R4pe2WbUenEmzKXu1yGjqhBBENrQ_1VA8ryMxDSRO7pMMMhNjweBBD9YdKbEh/exec",
  updateRepo: "Saiful44711/Lift-Ride-Test"
};
