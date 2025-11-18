chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'PLAY_SOUND') {
    const audio = document.getElementById('audio-player');
    audio.src = message.src;
    audio.play();
  }
});