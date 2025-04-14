// ==============================================
// Global Constants and Variables
// Make sure these are declared ONLY ONCE at the top
// ==============================================
const clientId = '164e5029d0d24a7ea0c28a7066c11202';
const clientSecret = '42b93de906374ecf893e1c3e63264c62';
const moodButtons = document.querySelectorAll('.mood-btn');
const playlistGrid = document.getElementById('playlist-grid');
const resultsTitle = document.getElementById('results-title');
const loader = document.getElementById('loader');
const audioPlayer = document.getElementById('audio-player');
const playPauseBtn = document.getElementById('play-pause-btn');
const progressBar = document.getElementById('progress-bar');
const nowPlayingImg = document.getElementById('now-playing-img');
const nowPlayingName = document.getElementById('now-playing-name');
const nowPlayingArtist = document.getElementById('now-playing-artist');
const themeToggleIcon = document.getElementById('theme-toggle-icon');

let accessToken = ''; // Token will be fetched
let currentTrackPreviewUrl = ''; // Holds the URL of the track currently loaded/playing
let isPlaying = false; // Tracks player state

// ==============================================
// Spotify API Functions
// ==============================================

// Function to get access token from Spotify
async function getAccessToken() {
    console.log('Attempting to get access token...');
    try {
        const response = await fetch('https://accounts.spotify.com/api/token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Authorization': 'Basic ' + btoa(clientId + ':' + clientSecret)
            },
            body: 'grant_type=client_credentials'
        });

        if (!response.ok) {
            const errorData = await response.json();
            console.error('Token error response:', errorData);
            throw new Error(`Failed to get access token: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        console.log('Successfully obtained new access token');

        // Store token expiration time (token expires in 3600 seconds/1 hour)
        // Adding a small buffer (e.g., 60 seconds) to refresh slightly before expiry
        const expirationTime = Date.now() + ((data.expires_in - 60) * 1000);
        localStorage.setItem('tokenExpiration', expirationTime.toString());

        return data.access_token;
    } catch (error) {
        console.error('Error getting access token:', error);
        throw error; // Re-throw to be caught by the caller
    }
}

// Check if token needs refresh
function isTokenExpired() {
    const expirationTime = localStorage.getItem('tokenExpiration');
    if (!expirationTime) {
        console.log('No expiration time found in localStorage.');
        return true; // Assume expired if no time stored
    }
    const isExpired = Date.now() > parseInt(expirationTime);
    return isExpired;
}

// Function to get search query based on mood
function getSearchQueryForMood(mood) {
    switch(mood.toLowerCase()) {
        case 'happy': return 'happy upbeat positive vibes';
        case 'sad': return 'sad melancholy emotional blues';
        case 'chill': return 'chill relax lofi ambient study';
        case 'focus': return 'focus concentration study instrumental beats';
        case 'workout': return 'workout gym motivation running power';
        default: return mood; // Use the mood term directly if not predefined
    }
}

// Function to search playlists by mood
async function searchPlaylistsByMood(mood, isRetry = false) { // Added isRetry flag
    console.log(`Searching playlists for mood: ${mood}`);
    try {
        // Check if token is expired and refresh if needed
        if (!accessToken || isTokenExpired()) {
            console.log('Token expired or not set, fetching new token...');
            accessToken = await getAccessToken();
        }

        let searchQuery = getSearchQueryForMood(mood);
        console.log(`Using search query: "${searchQuery}"`);
        const searchUrl = `https://api.spotify.com/v1/search?q=${encodeURIComponent(searchQuery)}&type=playlist&limit=50`; // Increased limit for better randomization

        const response = await fetch(searchUrl, {
            headers: { 'Authorization': 'Bearer ' + accessToken }
        });

        if (!response.ok) {
            // If token expired (401 Unauthorized) and not already retrying, try refreshing *once*
            if (response.status === 401 && !isRetry) {
                console.warn('Token seems invalid (401), attempting refresh and retry...');
                accessToken = await getAccessToken();
                // Retry the request with the new token, passing true for isRetry
                return searchPlaylistsByMood(mood, true);
            } else {
                // Handle other errors or failed retry
                const errorData = await response.json();
                console.error('Spotify API search error:', errorData);
                throw new Error(`Spotify API error: ${response.status} - ${errorData.error?.message || 'Unknown error'}`);
            }
        }

        const data = await response.json();

        if (!data.playlists || !data.playlists.items) {
            console.error('No playlist data structure in response:', data);
            throw new Error('Invalid response structure from Spotify API');
        }

        // Filter out null playlist entries *immediately*
        const validPlaylists = data.playlists.items.filter(playlist => playlist !== null);
        console.log(`Found ${data.playlists.items.length} total playlists, ${validPlaylists.length} are valid.`);

        return validPlaylists;
    } catch (error) {
        console.error('Error during searchPlaylistsByMood:', error);
        // Make sure the error propagates so it can be shown to the user
        throw error;
    }
}

// Function to get tracks from a playlist
async function getPlaylistTracks(playlistId, isRetry = false) { // Added isRetry flag
    console.log(`Fetching tracks for playlist ID: ${playlistId}`);
    try {
        if (!accessToken || isTokenExpired()) {
            console.log('Token expired or not set for track fetch, fetching new token...');
            accessToken = await getAccessToken();
        }

        const tracksUrl = `https://api.spotify.com/v1/playlists/${playlistId}/tracks?limit=30&fields=items(track(name,preview_url,artists(name),album(images)))`; // Limit fields for efficiency

        const response = await fetch(tracksUrl, {
            headers: { 'Authorization': 'Bearer ' + accessToken }
        });

        if (!response.ok) {
             // If token expired (401 Unauthorized) and not already retrying, try refreshing *once*
             if (response.status === 401 && !isRetry) {
                console.warn('Token seems invalid (401) for track fetch, attempting refresh and retry...');
                accessToken = await getAccessToken();
                // Retry the request with the new token
                return getPlaylistTracks(playlistId, true);
            } else {
                const errorData = await response.json();
                console.error('Spotify API track fetch error:', errorData);
                throw new Error(`Spotify API error fetching tracks: ${response.status} - ${errorData.error?.message || 'Unknown error'}`);
            }
        }

        const data = await response.json();

        if (!data.items) {
            console.error('No track items structure in response:', data);
            throw new Error('Invalid track response structure from Spotify API');
        }

        // Filter out null track entries and items without a track object
        const validTracks = data.items.filter(item => item && item.track);
        console.log(`Found ${data.items.length} total track items, ${validTracks.length} are valid.`);

        return validTracks;
    } catch (error) {
        console.error('Error during getPlaylistTracks:', error);
        throw error;
    }
}

// ==============================================
// UI and Helper Functions
// ==============================================

// Function to shuffle array (Fisher-Yates Algorithm)
function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

// Function to set up Intersection Observer for card animations
function setupCardObserver() {
    const cards = document.querySelectorAll('.playlist-card:not(.card-visible)'); // Select cards not yet animated
    if (cards.length === 0) {
        return; // Exit if no cards need observing
    }

    const observerOptions = {
        root: null, // Use the viewport as the root
        rootMargin: '0px',
        threshold: 0.1 // Trigger when at least 10% of the card is visible
    };

    const observerCallback = (entries, observer) => {
        entries.forEach((entry, index) => {
            if (entry.isIntersecting) {
                // Apply animation with a slight stagger based on index
                // Use requestAnimationFrame for smoother start
                requestAnimationFrame(() => {
                    setTimeout(() => {
                        entry.target.classList.add('card-visible');
                    }, index * 80); // 80ms delay between each card appearing
                });

                // Stop observing the card once it's visible
                observer.unobserve(entry.target);
            }
        });
    };

    const cardObserver = new IntersectionObserver(observerCallback, observerOptions);
    cards.forEach(card => cardObserver.observe(card));
    console.log(`Intersection Observer watching ${cards.length} new playlist cards.`);
}


// Function to display playlists in the grid
function displayPlaylists(playlists) {
    playlistGrid.innerHTML = ''; // Clear previous results

    // Filter out playlists without images or track info (should be rare now, but good practice)
    const displayablePlaylists = playlists.filter(playlist =>
        playlist &&
        playlist.images &&
        playlist.images.length > 0 &&
        playlist.tracks
    );

    if (displayablePlaylists.length === 0) {
        playlistGrid.innerHTML = '<p>No suitable playlists found for this mood. Try another one!</p>';
        console.warn('No displayable playlists after filtering.');
        return;
    }

    // Shuffle the displayable playlists
    shuffleArray(displayablePlaylists);

    // Limit to a reasonable number (e.g., 12) to avoid overwhelming the UI
    const playlistsToShow = displayablePlaylists.slice(0, 12);
    console.log(`Displaying ${playlistsToShow.length} playlists`);

    playlistsToShow.forEach(playlist => {
        const playlistCard = document.createElement('div');
        playlistCard.className = 'playlist-card'; // Initial state (hidden due to CSS)
        playlistCard.dataset.id = playlist.id; // Store ID for track fetching

        // Sanitize description (handle potential null and HTML entities)
        let description = playlist.description || 'No description available';
        try {
            // Use a temporary element to decode HTML entities robustly
            const tempEl = document.createElement('textarea');
            tempEl.innerHTML = description;
            description = tempEl.value;
        } catch (e) {
            console.warn('Could not decode HTML entities in description:', e);
            // Fallback: basic replacement
            description = description.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
        }


        playlistCard.innerHTML = `
            <img src="${playlist.images[0].url}" alt="${playlist.name}" class="playlist-image" loading="lazy">
            <div class="playlist-info">
                <h3 class="playlist-name">${playlist.name}</h3>
                <p class="playlist-description">${description}</p>
                <p class="playlist-tracks">${playlist.tracks.total} tracks</p>
                <button class="preview-btn" data-id="${playlist.id}" aria-label="Preview playlist ${playlist.name}">
                    <i class="fas fa-headphones" aria-hidden="true"></i> Preview
                </button>
            </div>
        `;
        playlistGrid.appendChild(playlistCard);
    });

    // Attach button listeners AFTER cards are in the DOM
    attachPreviewButtonListeners();

    // ----> Set up the observer AFTER cards are in the DOM <----
    setupCardObserver();
}

// Function to attach listeners to preview buttons (call after displayPlaylists)
function attachPreviewButtonListeners() {
     // Use event delegation on the grid for potentially better performance if many cards
     // However, direct attachment is fine here too. Let's stick to direct for simplicity now.
    document.querySelectorAll('.preview-btn').forEach(btn => {
        // Simple way to ensure no duplicate listeners: replace node then add listener
        const newBtn = btn.cloneNode(true);
        btn.parentNode.replaceChild(newBtn, btn);
        newBtn.addEventListener('click', handlePreviewClick);
     });
}

// Handler for preview button clicks
async function handlePreviewClick(event) {
    event.stopPropagation(); // Prevent card click if button is clicked
    const button = event.currentTarget;
    const playlistId = button.dataset.id;
    console.log(`Preview clicked for playlist ID: ${playlistId}`);

    // Indicate loading state on the button
    button.disabled = true;
    button.innerHTML = '<i class="fas fa-spinner fa-spin" aria-hidden="true"></i> Loading...';

    try {
        loader.style.display = 'flex'; // Show global loader as well
        const trackItems = await getPlaylistTracks(playlistId);

        // Filter for tracks that have a preview_url and necessary album info
        const tracksWithPreview = trackItems.filter(item =>
            item.track &&
            item.track.preview_url &&
            item.track.album &&
            item.track.album.images &&
            item.track.album.images.length > 0 &&
            item.track.artists &&
            item.track.artists.length > 0
        );

        if (tracksWithPreview.length > 0) {
            console.log(`Found ${tracksWithPreview.length} tracks with previews.`);
            // Randomly select one track with a preview
            const randomIndex = Math.floor(Math.random() * tracksWithPreview.length);
            const selectedTrack = tracksWithPreview[randomIndex].track;
            console.log('Selected track for preview:', selectedTrack.name);
            playTrack(selectedTrack);
        } else {
            console.warn('No tracks with preview URLs found in this playlist.');
            alert('Sorry, no preview available for this playlist.');
             // Restore button if no preview found
            button.disabled = false;
            button.innerHTML = '<i class="fas fa-headphones" aria-hidden="true"></i> Preview';
        }
    } catch (error) {
        console.error('Error fetching or processing tracks for preview:', error);
        alert(`Failed to get playlist preview: ${error.message}`);
         // Restore button on error
        button.disabled = false;
        button.innerHTML = '<i class="fas fa-headphones" aria-hidden="true"></i> Preview';
    } finally {
        loader.style.display = 'none'; // Hide global loader
        // Button state is restored within try/catch/if-else for more precise control
    }
}


// Function to play a track preview
function playTrack(track) {
    if (!track || !track.preview_url) {
        console.error('Attempted to play track without preview_url:', track);
        alert('Selected track has no preview available.');
        return;
    }

    console.log(`Playing preview: ${track.name} - ${track.preview_url}`);
    currentTrackPreviewUrl = track.preview_url; // Set the global variable
    audioPlayer.src = currentTrackPreviewUrl;

    // Attempt to play, handle potential browser restrictions
    const playPromise = audioPlayer.play();

    if (playPromise !== undefined) {
        playPromise.then(() => {
            // Playback started successfully
            isPlaying = true;
            playPauseBtn.innerHTML = '<i class="fas fa-pause" aria-hidden="true"></i>';
            playPauseBtn.setAttribute('aria-label', 'Pause preview');
            console.log('Playback started.');
        }).catch(error => {
            // Playback failed (e.g., browser policy, decode error)
            console.error('Error starting audio playback:', error);
            alert(`Could not play audio preview: ${error.message}. Browser interaction might be required first.`);
            isPlaying = false; // Ensure state is correct on error
             playPauseBtn.innerHTML = '<i class="fas fa-play" aria-hidden="true"></i>';
             playPauseBtn.setAttribute('aria-label', 'Play preview');
             currentTrackPreviewUrl = ''; // Clear invalid URL
        });
    }

    // Update the 'Now Playing' info in the footer
    nowPlayingImg.src = track.album.images[0].url; // Assumes image exists based on filter
    nowPlayingImg.alt = `Album art for ${track.name}`;
    nowPlayingName.textContent = track.name;
    nowPlayingArtist.textContent = track.artists.map(artist => artist.name).join(', ');

    // Ensure player container is visible
    document.getElementById('player-container').style.display = 'flex';
}

// Function to toggle play/pause of the current track
function togglePlayPause() {
    if (!currentTrackPreviewUrl || !audioPlayer.src) {
        console.log('Play/pause clicked, but no track loaded or src is invalid.');
        return; // No track loaded or src set
    }

    if (isPlaying) {
        audioPlayer.pause();
        console.log('Playback paused.');
        playPauseBtn.innerHTML = '<i class="fas fa-play" aria-hidden="true"></i>';
        playPauseBtn.setAttribute('aria-label', 'Play preview');
        isPlaying = false; // Update state after action
    } else {
        // Check if audio context needs resuming (required after user interaction in some browsers)
        const playPromise = audioPlayer.play();
         if (playPromise !== undefined) {
            playPromise.then(() => {
                // Playback resumed successfully
                console.log('Playback resumed.');
                playPauseBtn.innerHTML = '<i class="fas fa-pause" aria-hidden="true"></i>';
                playPauseBtn.setAttribute('aria-label', 'Pause preview');
                 isPlaying = true; // Update state after action
            })
            .catch(error => {
                console.error('Error resuming audio playback:', error);
                alert(`Could not resume playback: ${error.message}`);
                // Don't flip isPlaying state if play failed
                isPlaying = false;
                playPauseBtn.innerHTML = '<i class="fas fa-play" aria-hidden="true"></i>';
                playPauseBtn.setAttribute('aria-label', 'Play preview');
            });
        }
    }
}

// Function to update the progress bar based on audio playback time
function updateProgressBar() {
    // Check if audioPlayer exists and has a valid duration
    if (audioPlayer && !isNaN(audioPlayer.duration) && audioPlayer.duration > 0) {
        const percentage = (audioPlayer.currentTime / audioPlayer.duration) * 100;
        progressBar.style.width = `${Math.min(percentage, 100)}%`; // Ensure width doesn't exceed 100%
    } else {
        progressBar.style.width = '0%'; // Reset if no duration or invalid
    }
}


// Function to handle mood selection
async function selectMood(mood) {
    console.log(`Mood selected: ${mood}`);
    // Update active button state
    moodButtons.forEach(btn => {
        btn.classList.toggle('active', btn.dataset.mood === mood);
    });

    resultsTitle.textContent = `Finding ${mood} playlists...`; // Update title immediately
    playlistGrid.innerHTML = ''; // Clear previous results
    loader.style.display = 'flex'; // Show loader

    try {
        const playlists = await searchPlaylistsByMood(mood);

        if (playlists && playlists.length > 0) {
            resultsTitle.textContent = `${mood.charAt(0).toUpperCase() + mood.slice(1)} Playlists`;
            displayPlaylists(playlists); // This now calls setupCardObserver internally
        } else {
            resultsTitle.textContent = `No playlists found for ${mood}`;
            playlistGrid.innerHTML = '<p>Couldn\'t find any playlists for that mood. Maybe try a different one?</p>';
        }
    } catch (error) {
        console.error(`Error selecting mood ${mood}:`, error);
        resultsTitle.textContent = `Error finding playlists`;
        // Display a user-friendly error message
        playlistGrid.innerHTML = `<p>Oops! Something went wrong while fetching playlists: ${error.message}. Please check your connection or try again later.</p>`;
    } finally {
        loader.style.display = 'none'; // Hide loader regardless of outcome
    }
}

// Function to toggle between light and dark themes
function toggleTheme() {
    document.body.classList.toggle('dark-mode');
    const isDarkMode = document.body.classList.contains('dark-mode');
    if (isDarkMode) {
        themeToggleIcon.className = 'fas fa-sun'; // Show sun in dark mode
        themeToggleIcon.setAttribute('aria-label', 'Switch to light mode');
        localStorage.setItem('theme', 'dark');
        console.log('Theme switched to dark mode');
    } else {
        themeToggleIcon.className = 'fas fa-moon'; // Show moon in light mode
        themeToggleIcon.setAttribute('aria-label', 'Switch to dark mode');
        localStorage.setItem('theme', 'light');
        console.log('Theme switched to light mode');
    }
}

// Function to load the saved theme preference from localStorage
function loadSavedTheme() {
    const savedTheme = localStorage.getItem('theme');
    console.log(`Saved theme from localStorage: ${savedTheme}`);

    // Default is dark (set in HTML body class). Only switch to light if explicitly saved.
    if (savedTheme === 'light') {
        // Remove dark mode class if present and 'light' is saved
        if(document.body.classList.contains('dark-mode')) {
            document.body.classList.remove('dark-mode');
        }
        themeToggleIcon.className = 'fas fa-moon';
        themeToggleIcon.setAttribute('aria-label', 'Switch to dark mode');
        console.log('Applied light theme based on localStorage.');
    } else {
        // Ensure dark mode class is present if default or 'dark' is saved
        if (!document.body.classList.contains('dark-mode')) {
             document.body.classList.add('dark-mode');
        }
        // Set the icon for dark mode (sun)
        themeToggleIcon.className = 'fas fa-sun';
        themeToggleIcon.setAttribute('aria-label', 'Switch to light mode');
        console.log('Applied dark theme (default or saved).');
    }
}

// Function to initialize the application
async function initializeApp() {
    console.log('Initializing Mood Beats app...');
    loadSavedTheme(); // Apply theme first

    try {
        // Attempt to get an initial token
        if (!accessToken || isTokenExpired()) {
            console.log('Fetching initial access token...');
            accessToken = await getAccessToken();
        }

        // Restore last selected mood if available
        const savedMood = localStorage.getItem('lastMood');
        if (savedMood) {
            console.log(`Restoring last selected mood: ${savedMood}`);
             // Use requestAnimationFrame to ensure the UI is ready before selecting mood
             // and subsequent DOM manipulations like observer setup
            requestAnimationFrame(() => selectMood(savedMood));
        } else {
            console.log('No saved mood found.');
            resultsTitle.textContent = 'Select a mood to begin';
        }
    } catch (error) {
        console.error('FATAL: Error initializing app or getting initial token:', error);
        resultsTitle.textContent = 'Error Connecting';
        playlistGrid.innerHTML = `<p>Could not connect to Spotify services: ${error.message}. Please check your internet connection and reload the page.</p>`;
        loader.style.display = 'none'; // Ensure loader is hidden on fatal error
    }
}

// ==============================================
// Event Listeners Setup
// ==============================================
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM fully loaded and parsed');

    // Mood button listeners
    moodButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const mood = btn.dataset.mood;
            localStorage.setItem('lastMood', mood); // Save selected mood
            selectMood(mood);
        });
    });

    // Player control listener
    playPauseBtn.addEventListener('click', togglePlayPause);

    // Audio element listeners
    audioPlayer.addEventListener('timeupdate', updateProgressBar);
    audioPlayer.addEventListener('ended', () => {
        console.log('Preview finished playing.');
        isPlaying = false;
        playPauseBtn.innerHTML = '<i class="fas fa-play" aria-hidden="true"></i>';
        playPauseBtn.setAttribute('aria-label', 'Play preview');
        progressBar.style.width = '0%'; // Reset progress
    });
     audioPlayer.addEventListener('error', (e) => {
        console.error('Audio player error:', e);
        // More specific error handling could be added here based on e.target.error.code
        alert('An error occurred with the audio player.');
        isPlaying = false;
        playPauseBtn.innerHTML = '<i class="fas fa-play" aria-hidden="true"></i>';
        playPauseBtn.setAttribute('aria-label', 'Play preview');
        currentTrackPreviewUrl = ''; // Clear potentially problematic src
        audioPlayer.src = ''; // Stop trying to load faulty src
    });

    // Theme toggle listener
    themeToggleIcon.addEventListener('click', toggleTheme);

    // Start the application
    initializeApp();
});
