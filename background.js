const ALARM_NAME = 'focus_mode_alarm';

let creating; // A promise that resolves when the offscreen document is created

async function playSound(src) {
  // Check if an offscreen document is already active.
  const offscreenUrl = chrome.runtime.getURL('offscreen.html');
  const existingContexts = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT'],
    documentUrls: [offscreenUrl]
  });

  if (existingContexts.length > 0) {
    chrome.runtime.sendMessage({ type: 'PLAY_SOUND', src: src });
    return;
  }

  // create offscreen document
  if (creating) {
    await creating;
  } else {
    creating = chrome.offscreen.createDocument({
      url: 'offscreen.html',
      reasons: ['AUDIO_PLAYBACK'],
      justification: 'Playing a notification sound when the focus timer ends.',
    });
    await creating;
    creating = null; // Await and reset the promise
  }
  chrome.runtime.sendMessage({ type: 'PLAY_SOUND', src: src });
}

async function updateBlockingRules() {
  try {
    const { 
      sessionState = 'IDLE', // IDLE, WORK, BREAK
      blockedSites = [], 
      whitelistedSites = [] 
    } = await chrome.storage.sync.get(['sessionState', 'blockedSites', 'whitelistedSites']);

    // Only block sites during a WORK session
    const isFocusing = sessionState === 'WORK';

    const existingRules = await chrome.declarativeNetRequest.getDynamicRules();
    const ruleIdsToRemove = existingRules.map(rule => rule.id);

    let rulesToAdd = [];
    if (isFocusing && Array.isArray(blockedSites) && blockedSites.length > 0) {
      rulesToAdd = blockedSites
        .filter(site => typeof site === 'string' && site.length > 0) // Ensure site is a valid string
        .map((site, index) => ({
          id: index + 1, // Rule IDs must be > 0
          priority: 1,
          action: {
            type: 'redirect',
            redirect: { extensionPath: '/blocked.html' }
          },
          condition: {
            // The urlFilter must be a valid pattern.
            // We ensure 'site' is a clean hostname from the popup/options page.
            urlFilter: `||${site}/`,
            resourceTypes: ['main_frame'],
            excludedRequestDomains: whitelistedSites
          }
        }));
    }

    // This is a crucial debugging step.
    console.log('Attempting to update rules. isFocusing:', isFocusing);
    console.log('Sites to block:', blockedSites);
    console.log('Rules to add:', JSON.stringify(rulesToAdd, null, 2));

    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: ruleIdsToRemove,
      addRules: rulesToAdd
    });

    console.log('✅ Rules updated successfully.');
  } catch (error) {
    // This will catch errors if the rules are malformed.
    console.error('❌ Failed to update blocking rules:', error);
  }
}

// Listen for messages from the popup
chrome.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
  switch (message.type) {
    case 'START_TIMER':
      startNextPomodoroSession();
      break;
    case 'STOP_TIMER':
      await chrome.storage.sync.set({ 
        sessionState: 'IDLE', 
        endTime: null, 
        pomodorosCompleted: 0 
      });
      chrome.alarms.clear(ALARM_NAME);
      updateBlockingRules();
      break;
    case 'UPDATE_RULES':
      // This is called when block/whitelist is changed in options
      updateBlockingRules();
      break;
    case 'PLAY_SOUND_PREVIEW':
      if (message.src === 'custom') {
        const { customSoundData } = await chrome.storage.local.get('customSoundData');
        if (customSoundData) {
          playSound(customSoundData);
        }
      } else if (message.src && message.src !== 'none') {
        playSound(message.src);
      }
      break;
  }
});

// Listen for the alarm to end the session
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === ALARM_NAME) {
    const { sessionState = 'IDLE' } = await chrome.storage.sync.get('sessionState');
    
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'images/icon128.png',
      title: sessionState === 'WORK' ? 'Work Session Over!' : 'Break Time Over!',
      message: sessionState === 'WORK' ? 'Time for a break!' : 'Time to get back to work!'
    });

    const { selectedSound } = await chrome.storage.sync.get({ selectedSound: 'sounds/notification.mp3' });

    if (selectedSound === 'custom') {
      // If custom is selected, get the data from local storage
      const { customSoundData } = await chrome.storage.local.get('customSoundData');
      if (customSoundData) {
        playSound(customSoundData);
      }
    } else if (selectedSound !== 'none') {
      playSound(selectedSound);
    }

    // Start the next session in the cycle
    startNextPomodoroSession(sessionState === 'WORK');
  }
});

async function startNextPomodoroSession(wasWorkSession = false) {
  const { 
    pomodorosCompleted = 0,
    pomodoroSettings = {
      workDuration: 25,
      shortBreakDuration: 5,
      longBreakDuration: 15,
      longBreakInterval: 4,
    }
  } = await chrome.storage.sync.get(['pomodorosCompleted', 'pomodoroSettings']);

  let nextState;
  let nextDuration;
  let newPomodorosCompleted = pomodorosCompleted;

  if (wasWorkSession) {
    // After work, it's always a break

    // --- NEW: Update historical stats ---
    // Using YYYY-MM-DD format for a consistent key
    const today = new Date().toISOString().split('T')[0]; 
    const { pomodoroHistory = {} } = await chrome.storage.sync.get('pomodoroHistory');

    // Increment today's count, initializing if it doesn't exist
    pomodoroHistory[today] = (pomodoroHistory[today] || 0) + 1;

    await chrome.storage.sync.set({ pomodoroHistory });
    // --- END NEW ---

    newPomodorosCompleted++;
    if (newPomodorosCompleted % pomodoroSettings.longBreakInterval === 0) {
      nextState = 'BREAK';
      nextDuration = pomodoroSettings.longBreakDuration;
    } else {
      nextState = 'BREAK';
      nextDuration = pomodoroSettings.shortBreakDuration;
    }
  } else {
    // After a break or from idle, it's always work
    nextState = 'WORK';
    nextDuration = pomodoroSettings.workDuration;
  }

  const endTime = Date.now() + nextDuration * 60 * 1000;

  await chrome.storage.sync.set({
    sessionState: nextState,
    endTime: endTime,
    totalDuration: nextDuration * 60 * 1000,
    pomodorosCompleted: newPomodorosCompleted
  });

  chrome.alarms.create(ALARM_NAME, { when: endTime });
  updateBlockingRules();
}

// Run on startup to set the initial state
chrome.runtime.onStartup.addListener(() => {
  console.log("Browser started. Updating rules.");
  updateBlockingRules();
});
chrome.runtime.onInstalled.addListener(() => {
  console.log("Extension installed/updated. Updating rules.");
  updateBlockingRules();
});