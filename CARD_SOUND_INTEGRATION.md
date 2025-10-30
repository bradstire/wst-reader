# Card Sound Integration — Technical Design

**Date**: October 21, 2025  
**Purpose**: Insert card flip/deal sounds before each card reveal in final audio

---

## Overview

This system integrates card flip/deal sound effects into the final audio production by:
1. Detecting first-time card announcements in the reading text
2. Calculating precise timestamps for each card reveal
3. Inserting alternating card flip sounds ~2 seconds before each card
4. Stitching everything together into the final audio file

---

## Architecture

### **Input Files**
1. **Reading text with breaks**: `FULL_READING_with_breaks__[Sign]__[Timestamp].txt`
2. **Card flip sound 1**: `assets/card-sounds/card-flip-1.mp3`
3. **Card flip sound 2**: `assets/card-sounds/card-flip-2.mp3`

### **Output Files**
1. **Final audio with card sounds**: `FULL_READING_with_cards__[Sign]__[Timestamp].mp3`
2. **Timestamp log**: Card announcement timestamps for reference

---

## Production Pipeline

### **Current Flow** (without card sounds):
```
1. Generate reading text (OpenAI API)
2. Apply breaks (apply_breaks.py)
3. Generate TTS audio (ElevenLabs API)
4. Done
```

### **New Flow** (with card sounds):
```
1. Generate reading text (OpenAI API)
2. Apply breaks (apply_breaks.py) ← Updated: 2-2.5s pre-card breaks
3. Parse text to find card reveal timestamps
4. Generate TTS audio (ElevenLabs API)
5. Insert card flip sounds at timestamps ← NEW STEP
6. Stitch final audio
7. Done
```

---

## Implementation Options

### **Option A: Pre-TTS Text Insertion** ❌
- Insert `[CARD_FLIP_SOUND_1]` markers in text
- Problems: ElevenLabs will try to read the markers

### **Option B: Post-TTS Audio Insertion** ✅ **RECOMMENDED**
- Generate TTS audio normally
- Calculate card reveal timestamps from text + breaks
- Insert card flip MP3s at calculated positions
- Stitch audio chunks together
- Cleanest, most flexible approach

### **Option C: During Long-Form Generation** ⚠️
- Insert sounds during chunking/stitching
- Complex, tightly coupled to existing flow

---

## Recommended Approach: Option B

### **Step 1: Parse Text & Calculate Timestamps**

Create new script: `insert_card_sounds.py`

**Functionality**:
- Read text with breaks
- Track accumulated time as we process:
  - Estimate ~150 WPM speaking rate
  - Add break durations from `<break time="Xs" />` tags
  - Detect first-time card reveals
  - Record timestamp for each card (where break starts)

**Output**: JSON with card reveal timestamps
```json
{
  "card_reveals": [
    {"card": "The Fool", "timestamp": 45.3, "sound_file": "card-flip-1.mp3"},
    {"card": "The Tower", "timestamp": 182.7, "sound_file": "card-flip-2.mp3"},
    ...
  ]
}
```

### **Step 2: Audio Insertion**

Using `pydub` or `ffmpeg`:
- Load base TTS audio
- Load card flip sounds
- For each timestamp:
  - Insert card flip sound at timestamp
  - Adjust timing to place sound ~0.5s before actual card mention
- Export final stitched audio

---

## Technical Details

### **Timestamp Calculation**

```python
def calculate_timestamps(text_with_breaks):
    """Calculate card reveal timestamps from text with breaks."""
    current_time = 0.0
    card_reveals = []
    card_counter = 0
    revealed_cards = set()
    
    # Split into sentences
    sentences = re.split(r'(?<=[.!?])\s*(?:<break[^>]*>)?\s*', text)
    
    for sentence in sentences:
        # Extract break time if present
        break_match = re.search(r'<break time="([\d.]+)s"\s*/>', sentence)
        if break_match:
            break_time = float(break_match.group(1))
            current_time += break_time
        
        # Remove break tags to get clean text
        clean_sentence = re.sub(r'<break[^>]*>', '', sentence).strip()
        
        # Check for card reveal
        card_match = re.search(r'The [A-Z][^.]+(?:, (?:reversed|upright))?', clean_sentence)
        if card_match and card_match.group(0) not in revealed_cards:
            card_name = card_match.group(0)
            revealed_cards.add(card_name)
            
            # Determine which sound file to use (alternate)
            sound_file = f"card-flip-{(card_counter % 2) + 1}.mp3"
            
            card_reveals.append({
                'card': card_name,
                'timestamp': current_time - 2.0,  # Insert 2s before card mention
                'sound_file': sound_file
            })
            card_counter += 1
        
        # Estimate speaking time for this sentence (150 WPM)
        word_count = len(clean_sentence.split())
        speaking_time = (word_count / 150) * 60
        current_time += speaking_time
    
    return card_reveals
```

### **Audio Insertion**

```python
from pydub import AudioSegment

def insert_card_sounds(base_audio_path, card_reveals, output_path):
    """Insert card flip sounds at specified timestamps."""
    base_audio = AudioSegment.from_mp3(base_audio_path)
    
    # Sort reveals by timestamp (reverse order for easier insertion)
    reveals = sorted(card_reveals, key=lambda x: x['timestamp'], reverse=True)
    
    for reveal in reveals:
        timestamp_ms = int(reveal['timestamp'] * 1000)
        sound_file = f"assets/card-sounds/{reveal['sound_file']}"
        card_sound = AudioSegment.from_mp3(sound_file)
        
        # Split base audio at timestamp
        before = base_audio[:timestamp_ms]
        after = base_audio[timestamp_ms:]
        
        # Insert card sound
        base_audio = before + card_sound + after
    
    # Export final audio
    base_audio.export(output_path, format="mp3")
```

---

## Dependencies

**Python packages needed**:
```bash
pip install pydub
```

**System requirements**:
- ffmpeg (for audio processing)
  ```bash
  brew install ffmpeg  # macOS
  ```

---

## Folder Structure

```
/Users/bradstire/wst-reader/
├── assets/
│   └── card-sounds/
│       ├── README.md              ← Instructions
│       ├── card-flip-1.mp3        ← Drop here
│       └── card-flip-2.mp3        ← Drop here
├── apply_breaks.py                ← Updated: 2-2.5s pre-card breaks
├── insert_card_sounds.py          ← To be created
└── output/
    ├── FULL_READING_with_breaks_...txt
    └── FULL_READING_with_cards_...mp3  ← Final output
```

---

## Usage Workflow

### **Current Process**:
```bash
# Generate reading
python3 generate_prompts.py --sign Gemini

# Apply breaks
python3 apply_breaks.py output/FULL_READING__Gemini__[timestamp].txt

# Generate TTS (manual or via script)
```

### **New Process** (after audio files provided):
```bash
# Generate reading
python3 generate_prompts.py --sign Gemini

# Apply breaks
python3 apply_breaks.py --sign Gemini output/FULL_READING__Gemini__[timestamp].txt

# Generate TTS audio
# [Manual or automated via ElevenLabs]

# Insert card sounds (NEW STEP)
python3 insert_card_sounds.py \
  --text output/FULL_READING_with_breaks__Gemini__[timestamp].txt \
  --audio output/FULL_READING_audio__Gemini__[timestamp].mp3 \
  --output output/FULL_READING_with_cards__Gemini__[timestamp].mp3
```

---

## Timestamp Logging

The script will generate a timestamp log for reference:

```json
{
  "reading": "Gemini__2025-10-21T02-30-00Z",
  "total_duration": "15:23",
  "card_reveals": [
    {
      "card_number": 1,
      "card_name": "The Fool",
      "orientation": "upright",
      "timestamp": "0:45.3",
      "sound_inserted": "card-flip-1.mp3"
    },
    {
      "card_number": 2,
      "card_name": "The Tower",
      "orientation": "reversed",
      "timestamp": "3:02.7",
      "sound_inserted": "card-flip-2.mp3"
    },
    ...
  ]
}
```

---

## Next Steps

1. ✅ **Folder created**: `/Users/bradstire/wst-reader/assets/card-sounds/`
2. ⏳ **Drop your audio files** there:
   - `card-flip-1.mp3`
   - `card-flip-2.mp3`
3. ⏳ **I'll create `insert_card_sounds.py`** script
4. ⏳ **Test with a full reading**

---

## Is This the Best Practice Moment?

**Yes!** Post-TTS audio insertion is the best approach because:

✅ **Pros**:
- Clean separation of concerns (text → TTS → audio effects)
- Precise control over timing
- No interference with TTS generation
- Can adjust sound placement without regenerating TTS
- Easy to A/B test different card sounds
- Maintains high audio quality

❌ **Alternative approaches would have issues**:
- Pre-TTS: ElevenLabs would try to read sound markers
- During TTS: Complex, fragile, model-dependent
- Manual editing: Time-consuming, not scalable

**Recommendation**: Insert sounds as a post-production step after TTS generation, before final export.

---

**Status**: Folder ready, awaiting audio files  
**Location**: `/Users/bradstire/wst-reader/assets/card-sounds/`


