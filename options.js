// This script handles the logic for the options page.
// It saves user settings to chrome.storage and restores them when the page is opened.

const DEFAULT_SOUNDS = [
  { name: 'Notification', path: 'sounds/notification.mp3' },
  { name: 'Bell', path: 'sounds/bell.mp3' },
  { name: 'Chime', path: 'sounds/chime.mp3' },
  { name: 'None', path: 'none' },
];

document.addEventListener('DOMContentLoaded', () => {
  // --- DOM Elements ---
  const workDurationInput = document.getElementById('work-duration');
  const shortBreakDurationInput = document.getElementById('short-break-duration');
  const longBreakDurationInput = document.getElementById('long-break-duration');
  const longBreakIntervalInput = document.getElementById('long-break-interval');
  const saveStatus = document.getElementById('save-status');

  const soundSelect = document.getElementById('sound-select');
  const playPreviewBtn = document.getElementById('play-preview-btn');
  const uploadSoundBtn = document.getElementById('upload-sound-btn');
  const soundFileInput = document.getElementById('sound-file-input');
  const customSoundNameSpan = document.getElementById('custom-sound-name');
  const removeCustomSoundBtn = document.getElementById('remove-custom-sound-btn');

  const newSiteInput = document.getElementById('new-site');
  const addSiteBtn = document.getElementById('add-site');
  const blockedSitesList = document.getElementById('blocked-sites-list');

  const whitelistSiteInput = document.getElementById('whitelist-site-input');
  const addWhitelistSiteBtn = document.getElementById('add-whitelist-site-btn');
  const whitelistedSitesList = document.getElementById('whitelisted-sites-list');

  // --- Functions ---

  /**
   * Shows a confirmation message for a short duration.
   */
  function showSaveConfirmation() {
    saveStatus.style.opacity = 1;
    setTimeout(() => {
      saveStatus.style.opacity = 0;
    }, 1500);
  }

  // --- Functions ---

  /**
   * Saves the Pomodoro settings to chrome.storage.sync.
   */
  function savePomodoroSettings() {
    const pomodoroSettings = {
      workDuration: parseInt(workDurationInput.value, 10) || 25,
      shortBreakDuration: parseInt(shortBreakDurationInput.value, 10) || 5,
      longBreakDuration: parseInt(longBreakDurationInput.value, 10) || 15,
      longBreakInterval: parseInt(longBreakIntervalInput.value, 10) || 4,
    };

    chrome.storage.sync.set({ pomodoroSettings }, () => {
      showSaveConfirmation();
    });
  }

  /**
   * Restores all options from chrome.storage.sync and populates the input fields.
   */
  function restoreOptions() {
    chrome.storage.sync.get({
      pomodoroSettings: { workDuration: 25, shortBreakDuration: 5, longBreakDuration: 15, longBreakInterval: 4 },
      selectedSound: DEFAULT_SOUNDS[0].path,
      customSoundName: null,
      blockedSites: [],
      whitelistedSites: [],
    }, (res) => {
      // Restore Pomodoro settings
      workDurationInput.value = res.pomodoroSettings.workDuration;
      shortBreakDurationInput.value = res.pomodoroSettings.shortBreakDuration;
      longBreakDurationInput.value = res.pomodoroSettings.longBreakDuration;
      longBreakIntervalInput.value = res.pomodoroSettings.longBreakInterval;

      // Restore Sound settings
      populateSoundList(res.customSoundName, res.selectedSound);
      updateCustomSoundUI(res.customSoundName);

      // Restore Blocked and Whitelisted sites
      renderSiteList(res.blockedSites, blockedSitesList, 'blockedSites');
      renderSiteList(res.whitelistedSites, whitelistedSitesList, 'whitelistedSites');
    });

  }

  /**
   * Populates the sound dropdown with default and custom sounds.
   * @param {string|null} customSoundName - The name of the uploaded custom sound.
   * @param {string} selectedValue - The currently selected sound path.
   */
  function populateSoundList(customSoundName, selectedValue) {
    soundSelect.innerHTML = '';
    DEFAULT_SOUNDS.forEach(sound => {
      const option = document.createElement('option');
      option.value = sound.path;
      option.textContent = sound.name;
      soundSelect.appendChild(option);
    });

    if (customSoundName) {
      const customOption = document.createElement('option');
      customOption.value = 'custom';
      customOption.textContent = 'Custom Sound';
      soundSelect.appendChild(customOption);
    }

    soundSelect.value = selectedValue;
  }

  /**
   * Updates the UI for the custom sound section based on whether a custom sound is present.
   * @param {string|null} name - The name of the custom sound file.
   */
  function updateCustomSoundUI(name) {
    if (name) {
      customSoundNameSpan.textContent = name;
      removeCustomSoundBtn.classList.remove('hidden');
    } else {
      customSoundNameSpan.textContent = 'No custom sound uploaded.';
      removeCustomSoundBtn.classList.add('hidden');
    }
  }

  /**
   * Handles the file upload process for custom sounds.
   */
  function handleFileUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const soundDataUrl = e.target.result;
      // Save sound data to local storage (can be large)
      chrome.storage.local.set({ customSoundData: soundDataUrl }, () => {
        // Save metadata to sync storage
        chrome.storage.sync.set({
          customSoundName: file.name,
          selectedSound: 'custom'
        }, () => {
          restoreOptions(); // Refresh the entire options UI
          showSaveConfirmation();
        });
      });
    };
    reader.readAsDataURL(file);
  }

  /**
   * Removes the custom sound from storage and updates the UI.
   */
  function handleRemoveCustomSound() {
    chrome.storage.local.remove('customSoundData');
    chrome.storage.sync.remove('customSoundName');
    // Revert to the default sound
    chrome.storage.sync.set({ selectedSound: DEFAULT_SOUNDS[0].path }, () => {
      restoreOptions();
      showSaveConfirmation();
    });
  }

  /**
   * Normalizes a URL or domain string into a clean hostname.
   * @param {string} input - The user's input.
   * @returns {string|null} The normalized hostname or null if invalid.
   */
  function normalizeDomain(input) {
    let url = input.trim();
    if (!url) return null;

    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = 'https://' + url;
    }

    try {
      const urlObject = new URL(url);
      return urlObject.hostname.replace(/^www\./, '');
    } catch (error) {
      return null;
    }
  }

  /**
   * Renders a list of sites (blocked or whitelisted) into a given UL element.
   * @param {string[]} sites - The array of site domains.
   * @param {HTMLElement} listElement - The <ul> element to populate.
   * @param {string} storageKey - The key in chrome.storage ('blockedSites' or 'whitelistedSites').
   */
  function renderSiteList(sites, listElement, storageKey) {
    listElement.innerHTML = '';
    if (!sites || sites.length === 0) {
      const li = document.createElement('li');
      li.textContent = 'No sites added yet.';
      li.style.justifyContent = 'center';
      li.style.color = '#6c757d';
      listElement.appendChild(li);
      return;
    }

    sites.forEach(site => {
      const li = document.createElement('li');
      li.textContent = site;

      const removeButton = document.createElement('button');
      removeButton.title = 'Remove';
      removeButton.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>`;
      
      removeButton.addEventListener('click', async () => {
        const { [storageKey]: currentSites = [] } = await chrome.storage.sync.get(storageKey);
        const updatedSites = currentSites.filter(s => s !== site);
        await chrome.storage.sync.set({ [storageKey]: updatedSites });
        chrome.runtime.sendMessage({ type: 'UPDATE_RULES' });
      });

      li.appendChild(removeButton);
      listElement.appendChild(li);
    });
  }

  /**
   * Handles adding a site to a given list (blocked or whitelisted).
   * @param {HTMLInputElement} inputElement - The input field for the new site.
   * @param {string} storageKey - The key in chrome.storage.
   */
  async function handleAddSite(inputElement, storageKey) {
    const normalizedSite = normalizeDomain(inputElement.value);
    if (normalizedSite) {
      const { [storageKey]: currentSites = [] } = await chrome.storage.sync.get(storageKey);
      if (!currentSites.includes(normalizedSite)) {
        const newSites = [...currentSites, normalizedSite];
        await chrome.storage.sync.set({ [storageKey]: newSites });
        chrome.runtime.sendMessage({ type: 'UPDATE_RULES' });
      }
      inputElement.value = '';
    } else {
      inputElement.style.borderColor = 'red';
      setTimeout(() => { inputElement.style.borderColor = ''; }, 2000);
    }
  }

  // --- Event Listeners ---
  restoreOptions(); // Restore settings when the page loads

  // Save Pomodoro settings whenever a value is changed
  [workDurationInput, shortBreakDurationInput, longBreakDurationInput, longBreakIntervalInput].forEach(input => {
    input.addEventListener('change', savePomodoroSettings);
  });

  // Save sound setting on change
  soundSelect.addEventListener('change', () => {
    chrome.storage.sync.set({ selectedSound: soundSelect.value }, showSaveConfirmation);
  });

  // Sound preview
  playPreviewBtn.addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'PLAY_SOUND_PREVIEW', src: soundSelect.value });
  });

  // Custom sound upload
  uploadSoundBtn.addEventListener('click', () => soundFileInput.click());
  soundFileInput.addEventListener('change', handleFileUpload);
  removeCustomSoundBtn.addEventListener('click', handleRemoveCustomSound);

  // Site list management
  addSiteBtn.addEventListener('click', () => handleAddSite(newSiteInput, 'blockedSites'));
  newSiteInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleAddSite(newSiteInput, 'blockedSites');
  });

  addWhitelistSiteBtn.addEventListener('click', () => handleAddSite(whitelistSiteInput, 'whitelistedSites'));
  whitelistSiteInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleAddSite(whitelistSiteInput, 'whitelistedSites');
  });

  // Listen for storage changes to keep the UI in sync with other parts of the extension (like the popup)
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'sync') return;

    if (changes.blockedSites) {
      renderSiteList(changes.blockedSites.newValue || [], blockedSitesList, 'blockedSites');
    }

    if (changes.whitelistedSites) {
      renderSiteList(changes.whitelistedSites.newValue || [], whitelistedSitesList, 'whitelistedSites');
    }
  });
});