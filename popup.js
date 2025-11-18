document.addEventListener('DOMContentLoaded', function() {
  // Views
  const setupView = document.getElementById('setup-view');
  const timerView = document.getElementById('timer-view');

  // Buttons and Inputs
  const startButton = document.getElementById('start-pomodoro-btn');
  const stopButton = document.getElementById('stop-pomodoro-btn');
  const sessionTitle = document.getElementById('session-title');

  const addSiteButton = document.getElementById('add-site');
  const newSiteInput = document.getElementById('new-site');
  const openOptionsButton = document.getElementById('open-options-btn');

  // Displays
  const timeRemainingDisplay = document.getElementById('time-remaining');
  const blockedSitesList = document.getElementById('blocked-sites-list');

  const newTaskInput = document.getElementById('new-task-input');
  const addTaskBtn = document.getElementById('add-task-btn');
  const taskList = document.getElementById('task-list');

  const dailyCountSpan = document.getElementById('daily-count');

  let countdownInterval = null;

  // --- Main Logic ---

  async function loadInitialData() {
    const { 
      sessionState = 'IDLE', 
      endTime, 
      totalDuration, 
      blockedSites = [],
      pomodoroHistory = {},
      tasks = []
    } = await chrome.storage.sync.get(['sessionState', 'endTime', 'totalDuration', 'blockedSites', 'pomodoroHistory', 'tasks']);

    if (sessionState !== 'IDLE' && endTime && Date.now() < endTime) {
      // Session is active
      showTimerView(sessionState);
      startCountdown(endTime, totalDuration);
    } else {
      // No active session
      showSetupView();
      // Clean up potentially stale state
      if (sessionState !== 'IDLE') {
        await chrome.storage.sync.set({ 
          sessionState: 'IDLE', 
          endTime: null, 
          totalDuration: null 
        });
      }
    }
    renderBlockedSites(blockedSites);
    renderTodoList(tasks);

    // Update daily count display from history
    const todayStr = new Date().toISOString().split('T')[0];
    dailyCountSpan.textContent = pomodoroHistory[todayStr] || 0;
  }

  function startCountdown(endTime, totalDuration) {
    if (countdownInterval) clearInterval(countdownInterval);

    const circle = document.querySelector('.progress-ring__circle');
    if (!circle) return; // Safety check
    const radius = circle.r.baseVal.value;
    const circumference = 2 * Math.PI * radius;

    circle.style.strokeDasharray = `${circumference} ${circumference}`;

    function setProgress(percent) {
      const offset = circumference - (percent / 100) * circumference;
      circle.style.strokeDashoffset = offset;
    }

    function updateProgress() {
      const now = Date.now();
      const timeLeft = endTime - now;

      if (timeLeft <= 0) {
        clearInterval(countdownInterval);
        timeRemainingDisplay.textContent = "00:00";
        setProgress(100); // Complete the circle
        showSetupView();
        return;
      }

      const elapsed = totalDuration - timeLeft;
      const progressPercent = (elapsed / totalDuration) * 100;
      setProgress(progressPercent);

      const minutes = Math.floor((timeLeft / 1000 / 60) % 60);
      const seconds = Math.floor((timeLeft / 1000) % 60);
      timeRemainingDisplay.textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    }
    
    // Initial update
    updateProgress();

    countdownInterval = setInterval(() => {
      updateProgress();
    }, 1000);
  }

  function showSetupView() {
    setupView.classList.remove('hidden');
    timerView.classList.add('hidden');
    if (countdownInterval) {
      clearInterval(countdownInterval);
      countdownInterval = null;
    }
  }

  function showTimerView(sessionState) {
    setupView.classList.add('hidden');
    timerView.classList.remove('hidden');
    const circle = document.querySelector('.progress-ring__circle');

    if (sessionState === 'WORK') {
      sessionTitle.textContent = 'Focusing...';
      circle.style.stroke = 'var(--primary-btn-bg)'; // Green for work
    } else { // BREAK
      sessionTitle.textContent = 'On a Break';
      circle.style.stroke = '#6c757d'; // Gray for break
    }
  }

  function renderBlockedSites(sites) {
    blockedSitesList.innerHTML = '';
    sites.forEach((site) => {
      const li = document.createElement('li');
      li.textContent = site;
      const removeButton = document.createElement('button');
      removeButton.title = 'Remove';
      removeButton.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>`;
      removeButton.addEventListener('click', async () => {
        const updatedSites = sites.filter(s => s !== site);
        await chrome.storage.sync.set({ blockedSites: updatedSites });
        renderBlockedSites(updatedSites); // Cập nhật UI thủ công
        chrome.runtime.sendMessage({ type: 'UPDATE_RULES' }); // Báo cho background cập nhật quy tắc
      });
      li.appendChild(removeButton);
      blockedSitesList.appendChild(li);
    });
  }

  // --- To-Do List Functions ---

  /**
   * Renders the list of tasks in the popup.
   * @param {Array<Object>} tasks - The array of task objects.
   */
  function renderTodoList(tasks) {
    taskList.innerHTML = '';
    if (!tasks || tasks.length === 0) {
      const li = document.createElement('li');
      li.textContent = "No tasks yet. Add one!";
      li.classList.add('empty-task-list');
      taskList.appendChild(li);
      return;
    }

    tasks.forEach(task => {
      const li = document.createElement('li');
      li.dataset.taskId = task.id;
      li.classList.toggle('completed', task.completed);
      li.draggable = true; // Make the list item draggable

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = task.completed;
      checkbox.addEventListener('change', () => handleToggleTask(task.id));

      const span = document.createElement('span');
      span.textContent = task.text;

      const editInput = document.createElement('input');
      editInput.type = 'text';
      editInput.className = 'edit-task-input';
      editInput.value = task.text;

      const editButton = document.createElement('button');
      editButton.title = 'Edit Task';
      editButton.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>`;
      editButton.classList.add('edit-btn');
      editButton.addEventListener('click', () => enterEditMode(li));

      const deleteButton = document.createElement('button');
      deleteButton.title = 'Delete Task';
      deleteButton.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`;
      deleteButton.addEventListener('click', () => handleDeleteTask(task.id));

      const taskActions = document.createElement('div');
      taskActions.className = 'task-actions';
      taskActions.appendChild(editButton);
      taskActions.appendChild(deleteButton);

      li.appendChild(checkbox);
      li.appendChild(span);
      li.appendChild(editInput);
      li.appendChild(taskActions);
      taskList.appendChild(li);
    });
  }

  /**
   * Adds a new task to the list.
   */
  async function handleAddTask() {
    const taskText = newTaskInput.value.trim();
    if (taskText) {
      const { tasks = [] } = await chrome.storage.sync.get('tasks');
      const newTask = { id: Date.now(), text: taskText, completed: false };
      await chrome.storage.sync.set({ tasks: [...tasks, newTask] });
      newTaskInput.value = '';
    }
  }

  /**
   * Toggles the completed state of a task.
   * @param {number} taskId - The ID of the task to toggle.
   */
  async function handleToggleTask(taskId) {
    const { tasks = [] } = await chrome.storage.sync.get('tasks');
    const newTasks = tasks.map(task => task.id === taskId ? { ...task, completed: !task.completed } : task);
    await chrome.storage.sync.set({ tasks: newTasks });
  }

  /**
   * Updates the text of a task.
   * @param {number} taskId - The ID of the task to update.
   * @param {string} newText - The new text for the task.
   */
  async function handleUpdateTask(taskId, newText) {
    const { tasks = [] } = await chrome.storage.sync.get('tasks');
    const newTasks = tasks.map(task =>
      task.id === taskId ? { ...task, text: newText } : task
    );
    await chrome.storage.sync.set({ tasks: newTasks });
  }

  /**
   * Deletes a task from the list.
   * @param {number} taskId - The ID of the task to delete.
   */
  async function handleDeleteTask(taskId) {
    const taskElement = taskList.querySelector(`li[data-task-id="${taskId}"]`);
    if (taskElement) {
      taskElement.classList.add('deleting');

      // Wait for the animation to finish before removing from storage.
      // The storage change listener will then re-render the list.
      setTimeout(async () => {
        const { tasks = [] } = await chrome.storage.sync.get('tasks');
        await chrome.storage.sync.set({ tasks: tasks.filter(task => task.id !== taskId) });
      }, 300); // Must match CSS animation duration
    }
  }

  /**
   * Puts a task item into edit mode.
   * @param {HTMLLIElement} li - The list item element.
   */
  function enterEditMode(li) {
    // Prevent entering edit mode if another task is already being edited
    const currentlyEditing = taskList.querySelector('li.editing');
    if (currentlyEditing) return;

    li.classList.add('editing');
    const input = li.querySelector('.edit-task-input');
    input.focus();
    input.select();

    const taskId = parseInt(li.dataset.taskId, 10);

    const exitAndSave = async () => {
      const newText = input.value.trim();
      // Only save if text is not empty
      if (newText) {
        await handleUpdateTask(taskId, newText);
      }
      // The storage listener will re-render the list, automatically exiting edit mode.
      // If it doesn't (e.g., text is the same), we manually remove the class.
      li.classList.remove('editing');
    };

    input.addEventListener('blur', exitAndSave, { once: true });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        input.blur(); // This will trigger the blur event listener to save
      } else if (e.key === 'Escape') {
        li.classList.remove('editing'); // Just exit without saving
      }
    });
  }

  // --- Drag and Drop Task Reordering ---

  let draggedItem = null;

  taskList.addEventListener('dragstart', (e) => {
    // Only act on LI elements
    if (e.target.tagName === 'LI') {
      draggedItem = e.target;
      // Use a timeout to allow the browser to render the drag image before we apply the class
      setTimeout(() => {
        draggedItem.classList.add('dragging');
      }, 0);
    }
  });

  taskList.addEventListener('dragend', () => {
    if (draggedItem) {
      draggedItem.classList.remove('dragging');
      draggedItem = null;
      saveTaskOrder(); // Save the new order after the drag operation is complete
    }
  });

  taskList.addEventListener('dragover', (e) => {
    e.preventDefault(); // This is necessary to allow a drop
    const afterElement = getDragAfterElement(taskList, e.clientY);
    if (draggedItem) {
      if (afterElement == null) {
        taskList.appendChild(draggedItem);
      } else {
        taskList.insertBefore(draggedItem, afterElement);
      }
    }
  });

  function getDragAfterElement(container, y) {
    const draggableElements = [...container.querySelectorAll('li:not(.dragging)')];

    return draggableElements.reduce((closest, child) => {
      const box = child.getBoundingClientRect();
      const offset = y - box.top - box.height / 2;
      if (offset < 0 && offset > closest.offset) {
        return { offset: offset, element: child };
      } else {
        return closest;
      }
    }, { offset: Number.NEGATIVE_INFINITY }).element;
  }

  async function saveTaskOrder() {
    const orderedTaskIds = [...taskList.querySelectorAll('li')].map(li => parseInt(li.dataset.taskId, 10));
    const { tasks = [] } = await chrome.storage.sync.get('tasks');
    const taskMap = new Map(tasks.map(task => [task.id, task]));
    const newTasks = orderedTaskIds.map(id => taskMap.get(id)).filter(Boolean);

    await chrome.storage.sync.set({ tasks: newTasks });
  }

  // --- Helper ---
  function normalizeDomain(input) {
    let url = input.trim();
    if (!url) return null;

    // Prepend a default protocol if none exists to make it a valid URL for the constructor.
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = 'https://' + url;
    }

    try {
      const urlObject = new URL(url);
      // The hostname property gives us the domain (e.g., 'www.youtube.com').
      // We can then remove 'www.' if desired.
      return urlObject.hostname.replace(/^www\./, '');
    } catch (error) {
      // The input was not a valid URL.
      return null;
    }
  }

  // --- Event Listeners ---

  startButton.addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'START_TIMER' });
  });

  async function handleAddSite() {
    const normalizedSite = normalizeDomain(newSiteInput.value);
    if (normalizedSite) {
      const { blockedSites = [] } = await chrome.storage.sync.get('blockedSites');
      if (!blockedSites.includes(normalizedSite)) {
        const newSites = [...blockedSites, normalizedSite];
        await chrome.storage.sync.set({ blockedSites: newSites });
        renderBlockedSites(newSites);
        chrome.runtime.sendMessage({ type: 'UPDATE_RULES' });
      }
      newSiteInput.value = '';
    } else {
      newSiteInput.style.borderColor = 'red';
      setTimeout(() => {
        newSiteInput.style.borderColor = 'var(--border-color)';
      }, 2000);
    }
  }

  addSiteButton.addEventListener('click', handleAddSite);

  newSiteInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      handleAddSite();
    }
  });

  addTaskBtn.addEventListener('click', handleAddTask);

  newTaskInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      handleAddTask();
    }
  });

  stopButton.addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'STOP_TIMER' });
    const circle = document.querySelector('.progress-ring__circle');
    if (circle) {
      const radius = circle.r.baseVal.value;
      const circumference = 2 * Math.PI * radius;
      circle.style.strokeDashoffset = circumference;
    }
    showSetupView();
  });

  openOptionsButton.addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });

  // Listen for storage changes from other parts of the extension
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'sync') {
      return;
    }

    console.log('Storage changed from another context. Reloading UI.', changes);

    // Animate transition only if the session state changes (WORK -> BREAK or vice-versa)
    if (changes.sessionState) {
      const clockContainer = document.querySelector('.clock-container');
      
      // Only animate if the timer view is already visible.
      if (clockContainer && !timerView.classList.contains('hidden')) {
        clockContainer.classList.add('is-transitioning');

        // Wait for the fade-out to finish before updating content and fading in.
        setTimeout(() => {
          loadInitialData(); // This will update text, colors, and timer.
          
          // After updating, we remove the class to trigger the fade-in transition.
          clockContainer.classList.remove('is-transitioning');
        }, 300); // Must match CSS transition duration
      } else {
        // If the timer wasn't running, just show the new state without animation.
        loadInitialData();
      }
    } else {
      // For other changes (e.g., adding/removing sites), just update the UI.
      loadInitialData();
    }
  });

  // --- Initial Load ---

  loadInitialData();
});
