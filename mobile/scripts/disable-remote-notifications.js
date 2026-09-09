/**
 * Postinstall script for MediTrack+
 * Disables remote push notification functionality and suppresses Expo Go fatal crashes
 * on Android SDK 53+. MediTrack+ uses strictly local notifications.
 */

const fs = require('fs');
const path = require('path');

function disableRemoteNotifications() {
  const expoNotificationsDir = path.join(__dirname, '..', 'node_modules', 'expo-notifications', 'build');

  if (!fs.existsSync(expoNotificationsDir)) {
    console.log('[disable-remote-notifications] expo-notifications not found, skipping.');
    return;
  }

  // 1. Patch warnOfExpoGoPushUsage.js so it issues a console.warn instead of throwing a fatal Error
  const warnFile = path.join(expoNotificationsDir, 'warnOfExpoGoPushUsage.js');
  if (fs.existsSync(warnFile)) {
    let warnContent = fs.readFileSync(warnFile, 'utf8');
    if (warnContent.includes("throw new Error(message);")) {
      warnContent = warnContent.replace(
        "throw new Error(message);",
        "didWarn = true; console.warn(message);"
      );
      fs.writeFileSync(warnFile, warnContent, 'utf8');
      console.log('[disable-remote-notifications] Patched warnOfExpoGoPushUsage.js (suppressed fatal throw).');
    }
  }

  // 2. Patch DevicePushTokenAutoRegistration.fx.js so it does not attach an unwanted push token listener
  const autoRegFile = path.join(expoNotificationsDir, 'DevicePushTokenAutoRegistration.fx.js');
  if (fs.existsSync(autoRegFile)) {
    let autoRegContent = fs.readFileSync(autoRegFile, 'utf8');
    if (autoRegContent.includes("if (ServerRegistrationModule.getRegistrationInfoAsync) {")) {
      autoRegContent = autoRegContent.replace(
        "if (ServerRegistrationModule.getRegistrationInfoAsync) {",
        "// Disabled remote push token auto-registration for local-only notifications in Expo Go\nif (false && ServerRegistrationModule.getRegistrationInfoAsync) {"
      );
      fs.writeFileSync(autoRegFile, autoRegContent, 'utf8');
      console.log('[disable-remote-notifications] Patched DevicePushTokenAutoRegistration.fx.js (disabled remote push listener).');
    }
  }

  // 3. Patch TopicSubscriptionModule.android.js so it does not crash when ExpoTopicSubscriptionModule is missing in Expo Go
  const topicFile = path.join(expoNotificationsDir, 'TopicSubscriptionModule.android.js');
  if (fs.existsSync(topicFile)) {
    let topicContent = fs.readFileSync(topicFile, 'utf8');
    if (topicContent.includes("requireNativeModule('ExpoTopicSubscriptionModule');")) {
      topicContent = `import { requireOptionalNativeModule } from 'expo-modules-core';
const nativeModule = typeof requireOptionalNativeModule === 'function' ? requireOptionalNativeModule('ExpoTopicSubscriptionModule') : null;
export default nativeModule ?? {
    addListener: () => { },
    removeListeners: () => { },
    subscribeToTopicAsync: () => Promise.resolve(null),
    unsubscribeFromTopicAsync: () => Promise.resolve(null),
};
`;
      fs.writeFileSync(topicFile, topicContent, 'utf8');
      console.log('[disable-remote-notifications] Patched TopicSubscriptionModule.android.js (graceful stub for removed FCM topics).');
    }
  }

  // 4. Patch index.js to replace remote push notification exports with safe stubs
  const indexFile = path.join(expoNotificationsDir, 'index.js');
  if (fs.existsSync(indexFile)) {
    let indexContent = fs.readFileSync(indexFile, 'utf8');
    let modified = false;

    if (indexContent.includes("export { getDevicePushTokenAsync } from './getDevicePushTokenAsync';")) {
      indexContent = indexContent.replace(
        "export { getDevicePushTokenAsync } from './getDevicePushTokenAsync';",
        "export const getDevicePushTokenAsync = async () => null;"
      );
      modified = true;
    }

    if (indexContent.includes("export { getExpoPushTokenAsync } from './getExpoPushTokenAsync';")) {
      indexContent = indexContent.replace(
        "export { getExpoPushTokenAsync } from './getExpoPushTokenAsync';",
        "export const getExpoPushTokenAsync = async () => ({ type: 'expo', data: '' });"
      );
      modified = true;
    }

    if (indexContent.includes("export { subscribeToTopicAsync, unsubscribeFromTopicAsync } from './topicSubscription';")) {
      indexContent = indexContent.replace(
        "export { subscribeToTopicAsync, unsubscribeFromTopicAsync } from './topicSubscription';",
        "export const subscribeToTopicAsync = async () => {};\nexport const unsubscribeFromTopicAsync = async () => {};"
      );
      modified = true;
    }

    if (indexContent.includes("export { setAutoServerRegistrationEnabledAsync } from './DevicePushTokenAutoRegistration.fx';")) {
      indexContent = indexContent.replace(
        "export { setAutoServerRegistrationEnabledAsync } from './DevicePushTokenAutoRegistration.fx';",
        "export const setAutoServerRegistrationEnabledAsync = async () => {};"
      );
      modified = true;
    }

    if (indexContent.includes("export * from './TokenEmitter';")) {
      indexContent = indexContent.replace(
        "export * from './TokenEmitter';",
        "export const addPushTokenListener = () => ({ remove: () => {} });"
      );
      modified = true;
    }

    if (modified) {
      fs.writeFileSync(indexFile, indexContent, 'utf8');
      console.log('[disable-remote-notifications] Patched index.js (replaced remote push exports with safe stubs).');
    }
  }
}

disableRemoteNotifications();
