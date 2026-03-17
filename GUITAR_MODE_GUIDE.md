# Guitar Mode Implementation - Summary

## Overview
I've successfully added a **Guitar Mode** to your BPM Trainer app that allows users to:
- Open their microphone and play guitar notes
- See real-time note detection (C, D, E, F, G, A, B, C#, D#, etc.)
- Track tuning accuracy (cents deviation from target note)
- Play along with a visual BPM metronome

## New Files Created

### 1. `src/utils/pitchDetection.ts`
Implements pitch detection using the autocorrelation algorithm:
- **detectPitch()** - Main function that analyzes audio buffer and detects frequency
- **frequencyToNote()** - Converts frequency to musical note with octave
- **isInTune()** - Checks if note is within ±10 cents of the target
- **isGuitarFrequency()** - Filters to guitar frequency range (75-1500 Hz)
- **getDeviationIndicator()** - Shows whether note is sharp (↑) or flat (↓)
- **getNoteString()** - Formats note as string (e.g., "C4", "D#5")

### 2. `src/hooks/useGuitarTrainer.ts`
Custom React hook managing guitar mode state:
- Handles microphone permission and stream setup
- Continuous pitch detection via AnimationFrame
- Maintains history of played notes (last 100)
- Tracks in-tune count and accuracy statistics
- Proper cleanup of audio resources

### 3. `src/components/GuitarMode.tsx`
UI component for guitar training:
- **Microphone Control**: Start/Stop buttons with permission error handling
- **Real-time Display**: Large, glowing note indicator when playing
- **Tuning Feedback**: Shows frequency (Hz) and cents deviation
- **Metronome Bar**: Animated progress bar synced to current BPM
- **Statistics**: Live accuracy, notes played, and in-tune count
- **Note History**: Scrollable list of recently played notes with tuning status
- **BPM Control**: Adjustable tempo while microphone is active

### 4. `src/components/GuitarMode.css`
Beautiful dark theme styling with:
- Cyan/blue accent colors (#00d4ff)
- Real-time animations and transitions
- Responsive grid layout
- Custom scrollbar styling
- Color-coded note history (green for in-tune, orange for out-of-tune)

## Modified Files

### `src/App.tsx`
- Import GuitarMode component
- Updated TrainerMode type from `'absolute' | 'interval'` to `'absolute' | 'interval' | 'guitar'`
- Added "Guitar" button to mode toggle
- Conditional rendering of GuitarMode UI
- Updated header to show "Guitar Trainer" when in guitar mode

### `src/hooks/useBpmTrainer.ts`
- Updated TrainerMode type to include 'guitar'

## Features & Capabilities

### Pitch Detection
- Uses autocorrelation algorithm for accurate frequency detection
- Filters out non-guitar frequencies automatically
- Detects notes from all octaves (not just guitar-specific range)
- Displays frequency in Hz for technical feedback

### Tuning Accuracy
- Shows deviation in cents (1 cent = 1/100 of a semitone)
- ✓ indicator when within ±10 cents (in tune)
- Color-coded feedback:
  - Green text when in tune
  - Orange text when out of tune
  - Arrows show direction (↑ sharp, ↓ flat)

### Real-time Feedback
- Live note display with glowing effect when active
- Pulsing metronome beat at center of progress bar
- Animated progress bar following BPM tempo
- Accuracy percentage updates continuously

### Session Management
- Reset button to clear history and statistics
- Auto-cleanup when switching modes
- Proper microphone/audio context cleanup

## Technical Details

### Pitch Detection Algorithm
The autocorrelation algorithm works by:
1. Taking audio samples from the microphone
2. Correlating the waveform with itself at different time offsets
3. Finding the offset with the highest correlation (fundamental frequency)
4. Converting frequency to musical note using logarithmic frequency scale

### Audio Setup
- FFT size: 4096 samples for detailed frequency analysis
- Smoothing: 0.8 constant for more stable detection
- Audio input settings:
  - Echo cancellation: OFF (to preserve note characteristics)
  - Noise suppression: OFF (to preserve quieter notes)
  - Auto gain control: OFF (for manual monitoring)

### Performance
- Uses requestAnimationFrame for smooth 60fps pitch detection
- Efficient state updates only when note changes
- Memory-conscious with note history limited to last 100 entries
- Proper cleanup of intervals and animation frames

## User Experience

### Getting Started
1. Open Settings (⚙ icon)
2. Select "Guitar" training mode
3. Set desired BPM
4. Click "Start Microphone"
5. Play guitar notes and watch them appear on screen
6. Green means in tune, orange means out of tune

### Visual Feedback
- Large note display: Shows what note you played (C4, D#5, etc.)
- Frequency display: Shows exact frequency in Hz
- Tuning indicator: Shows cents sharp/flat with arrow
- Accuracy bar: Shows % of notes played in tune
- Metronome: Animated bar showing beat position

## Browser Requirements
- Modern browser with Web Audio API support
- MediaDevices.getUserMedia() for microphone access
- HTTPS connection recommended (some browsers require it for microphone)

## Known Considerations

1. **Microphone Quality**: Accuracy depends on microphone quality and background noise
2. **Playing Style**: Clean, steady notes work better than slides or vibrato
3. **Frequency Range**: Works best with standard guitar tuning (E2 to E4 and above)
4. **Multiple Notes**: Detects the dominant frequency; polyphonic detection not implemented

## Future Enhancement Ideas
- Multi-note detection (chords)
- String-specific feedback
- Recording and playback of sessions
- Comparison with target note sequences
- Difficulty levels with note sequences
