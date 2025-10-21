# Card Flip/Deal Audio Samples

## Purpose
This folder contains card flip/deal sound effects to be inserted before each card reveal in the final audio production.

---

## Required Files

Please place your two card flip/deal audio samples here:

1. **`card-flip-1.mp3`** — First card flip sound
2. **`card-flip-2.mp3`** — Second card flip sound

The system will **alternate between these two sounds** for each of the five card reveals in a reading.

---

## File Specifications

- **Format**: MP3
- **Size**: ~30-50kb each
- **Duration**: Should be short (~0.5-1 second)
- **Quality**: 44.1kHz recommended (matches ElevenLabs output)

---

## Usage

The audio post-processing script will:

1. Parse the reading text to find first-time card announcements
2. Calculate timestamps based on accumulated text + breaks
3. Insert card flip sounds **2-2.5 seconds before** each card reveal
4. Alternate between `card-flip-1.mp3` and `card-flip-2.mp3`
5. Stitch everything together into final audio

---

## Card Reveal Sequence

For a typical 5-card reading:

| Card # | Sound Used | When |
|--------|-----------|------|
| Card 1 | card-flip-1.mp3 | ~2s before "The Fool..." |
| Card 2 | card-flip-2.mp3 | ~2s before "The Tower..." |
| Card 3 | card-flip-1.mp3 | ~2s before "The Lovers..." |
| Card 4 | card-flip-2.mp3 | ~2s before "The Moon..." |
| Card 5 | card-flip-1.mp3 | ~2s before "The Star..." |

Alternating pattern continues for any clarifier cards.

---

## Current Status

✅ Folder created: `/Users/bradstire/wst-reader/assets/card-sounds/`  
⏳ Awaiting audio files: `card-flip-1.mp3`, `card-flip-2.mp3`  
⏳ Audio post-processing script: To be created after files are provided

---

## Next Steps

1. **Drop your two audio files** into this folder
2. Name them exactly: `card-flip-1.mp3` and `card-flip-2.mp3`
3. We'll build the audio post-processing pipeline
4. Test with a full reading

---

**Created**: October 21, 2025  
**Location**: `/Users/bradstire/wst-reader/assets/card-sounds/`

