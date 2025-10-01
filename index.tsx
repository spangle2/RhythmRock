import React, { useState, useEffect, useRef } from 'react';
import { Music, Play, RotateCcw, Home, Volume2, Loader } from 'lucide-react';

const LANES = ['A', 'S', 'D', 'F'];

export default function RhythmGame() {
  const [screen, setScreen] = useState('menu');
  const [songs, setSongs] = useState([]);
  const [selectedSong, setSelectedSong] = useState(null);
  const [loading, setLoading] = useState(true);
  const [score, setScore] = useState(0);
  const [combo, setCombo] = useState(0);
  const [maxCombo, setMaxCombo] = useState(0);
  const [gameState, setGameState] = useState('playing');
  const [currentTime, setCurrentTime] = useState(0);
  const [notes, setNotes] = useState([]);
  const [feedback, setFeedback] = useState([]);
  const [particles, setParticles] = useState([]);
  const [pressedKeys, setPressedKeys] = useState({});
  
  const canvasRef = useRef(null);
  const animationRef = useRef(null);
  const audioRef = useRef(null);
  const audioContextRef = useRef(null);

  // Load and analyze songs on mount
  useEffect(() => {
    loadSongs();
  }, []);

  const loadSongs = async () => {
    setLoading(true);
    const songFiles = ['song1.mp3', 'song2.mp3', 'song3.mp3'];
    const loadedSongs = [];

    for (let i = 0; i < songFiles.length; i++) {
      try {
        const file = songFiles[i];
        const audio = new Audio(file);
        
        await new Promise((resolve, reject) => {
          audio.addEventListener('loadedmetadata', resolve);
          audio.addEventListener('error', reject);
          audio.load();
        });

        // Analyze audio for beats
        const beats = await analyzeAudio(file);
        
        loadedSongs.push({
          id: i + 1,
          name: `Song ${i + 1}`,
          file: file,
          duration: audio.duration,
          notes: beats,
          difficulty: beats.length < 50 ? 'Easy' : beats.length < 100 ? 'Medium' : 'Hard'
        });
      } catch (error) {
        console.error(`Failed to load ${songFiles[i]}:`, error);
      }
    }

    setSongs(loadedSongs);
    setLoading(false);
  };

  const analyzeAudio = async (audioFile) => {
    return new Promise((resolve, reject) => {
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const request = new XMLHttpRequest();
      
      request.open('GET', audioFile, true);
      request.responseType = 'arraybuffer';
      
      request.onload = () => {
        audioContext.decodeAudioData(request.response, (buffer) => {
          const beats = detectBeats(buffer, audioContext.sampleRate);
          resolve(beats);
        }, reject);
      };
      
      request.onerror = reject;
      request.send();
    });
  };

  const detectBeats = (buffer, sampleRate) => {
    const channelData = buffer.getChannelData(0);
    const beats = [];
    
    // Beat detection parameters
    const windowSize = Math.floor(sampleRate * 0.05); // 50ms window
    const hopSize = Math.floor(windowSize / 2);
    const threshold = 0.3;
    
    let prevEnergy = 0;
    
    for (let i = 0; i < channelData.length - windowSize; i += hopSize) {
      let energy = 0;
      
      // Calculate energy in current window
      for (let j = 0; j < windowSize; j++) {
        energy += Math.abs(channelData[i + j]);
      }
      energy /= windowSize;
      
      // Detect beat if energy spike
      if (energy > threshold && energy > prevEnergy * 1.5) {
        const time = i / sampleRate;
        const lane = Math.floor(Math.random() * 4);
        
        // Avoid notes too close together
        if (beats.length === 0 || time - beats[beats.length - 1].time > 0.2) {
          beats.push({ time, lane, id: beats.length });
        }
      }
      
      prevEnergy = energy;
    }
    
    return beats;
  };

  const startGame = (song) => {
    setSelectedSong(song);
    setScore(0);
    setCombo(0);
    setMaxCombo(0);
    setCurrentTime(0);
    setNotes(song.notes.map(n => ({ ...n, hit: false })));
    setFeedback([]);
    setParticles([]);
    setGameState('playing');
    setScreen('game');
    
    // Start audio playback
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    
    audioRef.current = new Audio(song.file);
    audioRef.current.play();
    
    // Sync with audio time
    const syncInterval = setInterval(() => {
      if (audioRef.current) {
        setCurrentTime(audioRef.current.currentTime);
        
        if (audioRef.current.ended) {
          clearInterval(syncInterval);
          endGame();
        }
      }
    }, 16); // ~60fps
  };

  const endGame = () => {
    if (audioRef.current) {
      audioRef.current.pause();
    }
    setGameState('ended');
    setScreen('results');
  };

  const handleKeyDown = (e) => {
    const key = e.key.toUpperCase();
    const laneIndex = LANES.indexOf(key);
    
    if (laneIndex === -1 || pressedKeys[key]) return;
    
    setPressedKeys(prev => ({ ...prev, [key]: true }));

    const hitWindow = 0.15;
    const perfectWindow = 0.08;
    
    const hitNotes = notes.filter(n => 
      !n.hit && 
      n.lane === laneIndex && 
      Math.abs(n.time - currentTime) < hitWindow
    );

    if (hitNotes.length > 0) {
      const closestNote = hitNotes.reduce((prev, curr) => 
        Math.abs(curr.time - currentTime) < Math.abs(prev.time - currentTime) ? curr : prev
      );

      const timeDiff = Math.abs(closestNote.time - currentTime);
      const isPerfect = timeDiff < perfectWindow;
      const scoreGain = isPerfect ? 100 : 50;

      // Play hit sound
      playHitSound(laneIndex, isPerfect);

      setNotes(prev => prev.map(n => 
        n.id === closestNote.id ? { ...n, hit: true } : n
      ));
      
      setScore(prev => prev + scoreGain);
      setCombo(prev => {
        const newCombo = prev + 1;
        setMaxCombo(max => Math.max(max, newCombo));
        return newCombo;
      });

      setFeedback(prev => [...prev, {
        id: Date.now(),
        text: isPerfect ? 'PERFECT!' : 'GOOD',
        x: laneIndex,
        isPerfect
      }]);

      for (let i = 0; i < 8; i++) {
        setParticles(prev => [...prev, {
          id: Date.now() + i,
          x: laneIndex,
          y: 0,
          vx: (Math.random() - 0.5) * 4,
          vy: Math.random() * -3 - 2,
          life: 1
        }]);
      }
    } else {
      setCombo(0);
      setFeedback(prev => [...prev, {
        id: Date.now(),
        text: 'MISS',
        x: laneIndex,
        isMiss: true
      }]);
    }
  };

  const playHitSound = (lane, isPerfect) => {
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    // Different frequencies for each lane
    const frequencies = [262, 330, 392, 523]; // C, E, G, C
    oscillator.frequency.value = frequencies[lane];
    
    oscillator.type = 'sine';
    gainNode.gain.setValueAtTime(isPerfect ? 0.3 : 0.2, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.1);
    
    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.1);
  };

  const handleKeyUp = (e) => {
    const key = e.key.toUpperCase();
    setPressedKeys(prev => ({ ...prev, [key]: false }));
  };

  useEffect(() => {
    if (screen === 'game' && gameState === 'playing') {
      window.addEventListener('keydown', handleKeyDown);
      window.addEventListener('keyup', handleKeyUp);
      return () => {
        window.removeEventListener('keydown', handleKeyDown);
        window.removeEventListener('keyup', handleKeyUp);
      };
    }
  }, [screen, gameState, notes, currentTime, pressedKeys]);

  useEffect(() => {
    if (screen === 'game' && gameState === 'playing') {
      const animate = () => {
        setFeedback(prev => prev.filter(f => Date.now() - f.id < 1000));
        setParticles(prev => prev.map(p => ({
          ...p,
          y: p.y + p.vy * 0.016,
          vy: p.vy + 0.15,
          x: p.x + p.vx * 0.016,
          life: p.life - 0.02
        })).filter(p => p.life > 0));

        animationRef.current = requestAnimationFrame(animate);
      };

      animationRef.current = requestAnimationFrame(animate);
      return () => cancelAnimationFrame(animationRef.current);
    }
  }, [screen, gameState]);

  useEffect(() => {
    if (screen !== 'game') return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const width = canvas.width = canvas.offsetWidth;
    const height = canvas.height = canvas.offsetHeight;

    const laneWidth = width / 4;
    const targetY = height - 80;
    const fallTime = 2;

    ctx.clearRect(0, 0, width, height);

    // Draw lanes
    for (let i = 0; i < 4; i++) {
      ctx.strokeStyle = pressedKeys[LANES[i]] ? '#ffffff' : '#333333';
      ctx.lineWidth = pressedKeys[LANES[i]] ? 3 : 1;
      ctx.beginPath();
      ctx.moveTo(i * laneWidth, 0);
      ctx.lineTo(i * laneWidth, height);
      ctx.stroke();
    }

    // Draw target line
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, targetY);
    ctx.lineTo(width, targetY);
    ctx.stroke();

    // Draw lane indicators
    ctx.font = 'bold 20px monospace';
    ctx.textAlign = 'center';
    for (let i = 0; i < 4; i++) {
      ctx.fillStyle = pressedKeys[LANES[i]] ? '#ffffff' : '#666666';
      ctx.fillText(LANES[i], i * laneWidth + laneWidth / 2, targetY + 40);
    }

    // Draw notes
    notes.forEach(note => {
      if (note.hit) return;

      const noteY = targetY - (note.time - currentTime) * (targetY / fallTime);
      
      if (noteY > height + 50) return;

      const x = note.lane * laneWidth + laneWidth / 2;
      const size = 30;

      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, noteY, size / 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    });

    // Draw particles
    particles.forEach(p => {
      const x = p.x * laneWidth + laneWidth / 2 + p.x * laneWidth * 0.3;
      const y = targetY + p.y * 50;
      ctx.fillStyle = `rgba(255, 255, 255, ${p.life})`;
      ctx.beginPath();
      ctx.arc(x, y, 3 * p.life, 0, Math.PI * 2);
      ctx.fill();
    });

    // Draw feedback
    ctx.font = 'bold 24px monospace';
    ctx.textAlign = 'center';
    feedback.forEach(f => {
      const age = Date.now() - f.id;
      const opacity = Math.max(0, 1 - age / 1000);
      const y = targetY - 50 - (age * 0.05);
      
      if (f.isPerfect) {
        ctx.fillStyle = `rgba(255, 255, 255, ${opacity})`;
      } else if (f.isMiss) {
        ctx.fillStyle = `rgba(150, 150, 150, ${opacity})`;
      } else {
        ctx.fillStyle = `rgba(200, 200, 200, ${opacity})`;
      }
      
      ctx.fillText(f.text, f.x * laneWidth + laneWidth / 2, y);
    });
  }, [notes, currentTime, feedback, particles, pressedKeys, screen]);

  if (loading) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <div className="text-center">
          <Loader className="w-12 h-12 animate-spin mx-auto mb-4" />
          <p className="text-xl">Analyzing songs...</p>
        </div>
      </div>
    );
  }

  if (screen === 'menu') {
    return (
      <div className="min-h-screen bg-black text-white p-8">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-12">
            <h1 className="text-6xl font-bold mb-4">
              RHYTHM MASTER
            </h1>
            <p className="text-xl text-gray-400">Select a song to begin</p>
          </div>

          <div className="grid gap-6">
            {songs.map(song => (
              <button
                key={song.id}
                onClick={() => startGame(song)}
                className="bg-white text-black border-2 border-white hover:bg-black hover:text-white rounded-xl p-6 transition-all hover:scale-105 text-left"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="bg-black text-white p-4 rounded-lg">
                      <Music className="w-8 h-8" />
                    </div>
                    <div>
                      <h3 className="text-2xl font-bold mb-1">{song.name}</h3>
                      <div className="flex gap-3 text-sm opacity-70">
                        <span>Difficulty: {song.difficulty}</span>
                        <span>•</span>
                        <span>{Math.floor(song.duration)}s</span>
                        <span>•</span>
                        <span>{song.notes.length} notes</span>
                      </div>
                    </div>
                  </div>
                  <Play className="w-6 h-6" />
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (screen === 'game') {
    return (
      <div className="min-h-screen bg-black text-white">
        <div className="p-4 flex justify-between items-center bg-gray-900">
          <div className="text-2xl font-bold">Score: {score}</div>
          <div className="text-xl">{selectedSong.name}</div>
          <div className="text-2xl font-bold">Combo: {combo}</div>
        </div>
        
        <div className="relative">
          <canvas
            ref={canvasRef}
            className="w-full"
            style={{ height: 'calc(100vh - 64px)' }}
          />
          
          <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-gray-900 px-4 py-2 rounded-full">
            <div className="w-64 h-2 bg-gray-700 rounded-full overflow-hidden">
              <div 
                className="h-full bg-white transition-all"
                style={{ width: `${(currentTime / selectedSong.duration) * 100}%` }}
              />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (screen === 'results') {
    const accuracy = selectedSong ? Math.round((score / (selectedSong.notes.length * 100)) * 100) : 0;
    
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center p-8">
        <div className="max-w-2xl w-full">
          <div className="text-center mb-8">
            <h1 className="text-6xl font-bold mb-2">
              {accuracy >= 90 ? 'AMAZING!' : accuracy >= 70 ? 'GREAT!' : 'GOOD TRY!'}
            </h1>
            <p className="text-2xl text-gray-400">{selectedSong?.name}</p>
          </div>

          <div className="bg-gray-900 border-2 border-white rounded-xl p-8 mb-6">
            <div className="grid grid-cols-2 gap-8 mb-6">
              <div className="text-center">
                <div className="text-5xl font-bold mb-2">
                  {score}
                </div>
                <div className="text-gray-400">Final Score</div>
              </div>
              <div className="text-center">
                <div className="text-5xl font-bold mb-2">
                  {maxCombo}
                </div>
                <div className="text-gray-400">Max Combo</div>
              </div>
            </div>
            
            <div className="text-center">
              <div className="text-3xl font-bold mb-2">{accuracy}%</div>
              <div className="text-gray-400">Accuracy</div>
            </div>
          </div>

          <div className="flex gap-4">
            <button
              onClick={() => startGame(selectedSong)}
              className="flex-1 bg-white text-black hover:bg-gray-200 py-4 rounded-xl font-bold text-lg flex items-center justify-center gap-2 transition-all hover:scale-105"
            >
              <RotateCcw className="w-5 h-5" />
              Retry
            </button>
            <button
              onClick={() => setScreen('menu')}
              className="flex-1 bg-gray-800 hover:bg-gray-700 py-4 rounded-xl font-bold text-lg flex items-center justify-center gap-2 transition-all hover:scale-105"
            >
              <Home className="w-5 h-5" />
              Menu
            </button>
          </div>
        </div>
      </div>
    );
  }
}
