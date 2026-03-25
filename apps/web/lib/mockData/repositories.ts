/**
 * Mock repository data for Explore page development
 * Structure matches RepositoryCard component expectations
 */

export interface MockExploreRepository {
  id: string;              // String ID for routing
  title: string;           // Repository name
  author: string;          // Owner username
  updatedAt: string;       // ISO timestamp
  stats: {
    stars?: number;        // Star count
    tracks: number;        // Number of audio files/tracks
    collaborators: number; // Number of collaborators
    commits?: number;      // Commit count
  };
  isPublic?: boolean;      // Default true for explore page
}

export const mockExploreRepos: MockExploreRepository[] = [
  {
    id: "1",
    title: "Summer Vibes Electronic Mix",
    author: "dj_luna",
    updatedAt: "2024-03-20T14:30:00Z",
    stats: {
      stars: 42,
      tracks: 12,
      collaborators: 3,
      commits: 47
    },
    isPublic: true
  },
  {
    id: "2",
    title: "Lo-Fi Hip Hop Beats",
    author: "chillbeats",
    updatedAt: "2024-03-19T09:15:00Z",
    stats: {
      stars: 128,
      tracks: 8,
      collaborators: 1,
      commits: 23
    },
    isPublic: true
  },
  {
    id: "3",
    title: "Jazz Fusion Experiment",
    author: "smooth_operator",
    updatedAt: "2024-03-18T16:45:00Z",
    stats: {
      stars: 67,
      tracks: 15,
      collaborators: 5,
      commits: 89
    },
    isPublic: true
  },
  {
    id: "4",
    title: "Dark Techno Sessions",
    author: "nightcrawler",
    updatedAt: "2024-03-17T22:00:00Z",
    stats: {
      stars: 203,
      tracks: 20,
      collaborators: 2,
      commits: 134
    },
    isPublic: true
  },
  {
    id: "5",
    title: "Acoustic Guitar Melodies",
    author: "stringmaster",
    updatedAt: "2024-03-16T11:20:00Z",
    stats: {
      stars: 89,
      tracks: 10,
      collaborators: 1,
      commits: 56
    },
    isPublic: true
  },
  {
    id: "6",
    title: "Ambient Soundscapes",
    author: "atmosphere_creator",
    updatedAt: "2024-03-15T08:30:00Z",
    stats: {
      stars: 156,
      tracks: 18,
      collaborators: 4,
      commits: 92
    },
    isPublic: true
  },
  {
    id: "7",
    title: "Trap Beats Collection",
    author: "beat_machine",
    updatedAt: "2024-03-14T19:10:00Z",
    stats: {
      stars: 245,
      tracks: 25,
      collaborators: 6,
      commits: 178
    },
    isPublic: true
  },
  {
    id: "8",
    title: "Classical Piano Compositions",
    author: "piano_virtuoso",
    updatedAt: "2024-03-13T15:40:00Z",
    stats: {
      stars: 312,
      tracks: 14,
      collaborators: 1,
      commits: 201
    },
    isPublic: true
  },
  {
    id: "9",
    title: "Indie Rock Garage Sessions",
    author: "garage_band",
    updatedAt: "2024-03-12T20:25:00Z",
    stats: {
      stars: 78,
      tracks: 16,
      collaborators: 4,
      commits: 112
    },
    isPublic: true
  },
  {
    id: "10",
    title: "Synthwave Retro Dreams",
    author: "retro_synth",
    updatedAt: "2024-03-11T12:50:00Z",
    stats: {
      stars: 189,
      tracks: 22,
      collaborators: 3,
      commits: 145
    },
    isPublic: true
  },
  {
    id: "11",
    title: "Deep House Grooves",
    author: "house_master",
    updatedAt: "2024-03-10T17:35:00Z",
    stats: {
      stars: 134,
      tracks: 13,
      collaborators: 2,
      commits: 87
    },
    isPublic: true
  },
  {
    id: "12",
    title: "Experimental Noise Project",
    author: "sonic_explorer",
    updatedAt: "2024-03-09T10:15:00Z",
    stats: {
      stars: 45,
      tracks: 9,
      collaborators: 7,
      commits: 234
    },
    isPublic: true
  },
  {
    id: "13",
    title: "R&B Vocal Tracks",
    author: "smooth_vocals",
    updatedAt: "2024-03-08T14:20:00Z",
    stats: {
      stars: 267,
      tracks: 11,
      collaborators: 5,
      commits: 156
    },
    isPublic: true
  },
  {
    id: "14",
    title: "Drum and Bass Energy",
    author: "dnb_warrior",
    updatedAt: "2024-03-07T21:45:00Z",
    stats: {
      stars: 198,
      tracks: 19,
      collaborators: 3,
      commits: 167
    },
    isPublic: true
  },
  {
    id: "15",
    title: "Folk Music Revival",
    author: "folk_tales",
    updatedAt: "2024-03-06T09:30:00Z",
    stats: {
      stars: 56,
      tracks: 7,
      collaborators: 2,
      commits: 34
    },
    isPublic: true
  },
  {
    id: "16",
    title: "EDM Festival Bangers",
    author: "festival_king",
    updatedAt: "2024-03-05T18:55:00Z",
    stats: {
      stars: 423,
      tracks: 28,
      collaborators: 8,
      commits: 289
    },
    isPublic: true
  },
  {
    id: "17",
    title: "Blues Guitar Licks",
    author: "blues_master",
    updatedAt: "2024-03-04T13:10:00Z",
    stats: {
      stars: 92,
      tracks: 12,
      collaborators: 1,
      commits: 67
    },
    isPublic: true
  },
  {
    id: "18",
    title: "Reggae Sunshine Rhythms",
    author: "island_vibes",
    updatedAt: "2024-03-03T16:40:00Z",
    stats: {
      stars: 145,
      tracks: 14,
      collaborators: 4,
      commits: 98
    },
    isPublic: true
  },
  {
    id: "19",
    title: "Metal Breakdown Riffs",
    author: "shredder",
    updatedAt: "2024-03-02T20:05:00Z",
    stats: {
      stars: 234,
      tracks: 17,
      collaborators: 5,
      commits: 201
    },
    isPublic: true
  },
  {
    id: "20",
    title: "Chillout Lounge Mix",
    author: "lounge_lizard",
    updatedAt: "2024-03-01T11:25:00Z",
    stats: {
      stars: 176,
      tracks: 21,
      collaborators: 2,
      commits: 134
    },
    isPublic: true
  },
  {
    id: "21",
    title: "Funk Bass Lines",
    author: "groove_master",
    updatedAt: "2024-02-29T15:50:00Z",
    stats: {
      stars: 112,
      tracks: 10,
      collaborators: 3,
      commits: 78
    },
    isPublic: true
  },
  {
    id: "22",
    title: "Orchestral Epic Scores",
    author: "composer_pro",
    updatedAt: "2024-02-28T09:15:00Z",
    stats: {
      stars: 389,
      tracks: 24,
      collaborators: 10,
      commits: 456
    },
    isPublic: true
  },
  {
    id: "23",
    title: "Minimal Techno Loops",
    author: "minimal_mind",
    updatedAt: "2024-02-27T19:30:00Z",
    stats: {
      stars: 87,
      tracks: 6,
      collaborators: 1,
      commits: 45
    },
    isPublic: true
  },
  {
    id: "24",
    title: "Soul Samples Library",
    author: "soul_searcher",
    updatedAt: "2024-02-26T14:45:00Z",
    stats: {
      stars: 201,
      tracks: 30,
      collaborators: 4,
      commits: 167
    },
    isPublic: true
  },
  {
    id: "25",
    title: "Progressive Trance Journey",
    author: "trance_master",
    updatedAt: "2024-02-25T22:10:00Z",
    stats: {
      stars: 278,
      tracks: 16,
      collaborators: 3,
      commits: 189
    },
    isPublic: true
  },
  {
    id: "26",
    title: "Country Road Songs",
    author: "country_star",
    updatedAt: "2024-02-24T10:35:00Z",
    stats: {
      stars: 63,
      tracks: 9,
      collaborators: 2,
      commits: 52
    },
    isPublic: true
  },
  {
    id: "27",
    title: "Dubstep Wobble Pack",
    author: "bass_cannon",
    updatedAt: "2024-02-23T17:20:00Z",
    stats: {
      stars: 345,
      tracks: 23,
      collaborators: 6,
      commits: 234
    },
    isPublic: true
  },
  {
    id: "28",
    title: "Latin Percussion Rhythms",
    author: "rhythm_section",
    updatedAt: "2024-02-22T13:55:00Z",
    stats: {
      stars: 129,
      tracks: 11,
      collaborators: 5,
      commits: 89
    },
    isPublic: true
  },
  {
    id: "29",
    title: "K-Pop Production Bundle",
    author: "pop_producer",
    updatedAt: "2024-02-21T21:40:00Z",
    stats: {
      stars: 412,
      tracks: 27,
      collaborators: 9,
      commits: 312
    },
    isPublic: true
  },
  {
    id: "30",
    title: "Meditation Sound Bath",
    author: "zen_sounds",
    updatedAt: "2024-02-20T08:15:00Z",
    stats: {
      stars: 98,
      tracks: 5,
      collaborators: 1,
      commits: 34
    },
    isPublic: true
  },
  {
    id: "31",
    title: "Punk Rock Anthems",
    author: "rebel_noise",
    updatedAt: "2024-02-19T16:25:00Z",
    stats: {
      stars: 156,
      tracks: 13,
      collaborators: 4,
      commits: 112
    },
    isPublic: true
  },
  {
    id: "32",
    title: "Afrobeat Dance Grooves",
    author: "afro_rhythm",
    updatedAt: "2024-02-18T12:50:00Z",
    stats: {
      stars: 223,
      tracks: 18,
      collaborators: 7,
      commits: 178
    },
    isPublic: true
  },
  {
    id: "33",
    title: "Cinematic Trailer Music",
    author: "epic_composer",
    updatedAt: "2024-02-17T20:15:00Z",
    stats: {
      stars: 467,
      tracks: 20,
      collaborators: 6,
      commits: 289
    },
    isPublic: true
  },
  {
    id: "34",
    title: "Breakbeat Classics",
    author: "break_master",
    updatedAt: "2024-02-16T11:40:00Z",
    stats: {
      stars: 134,
      tracks: 15,
      collaborators: 2,
      commits: 98
    },
    isPublic: true
  },
  {
    id: "35",
    title: "Celtic Folk Melodies",
    author: "celtic_harp",
    updatedAt: "2024-02-15T18:05:00Z",
    stats: {
      stars: 76,
      tracks: 8,
      collaborators: 3,
      commits: 56
    },
    isPublic: true
  },
  {
    id: "36",
    title: "Future Bass Drops",
    author: "future_sound",
    updatedAt: "2024-02-14T14:30:00Z",
    stats: {
      stars: 289,
      tracks: 19,
      collaborators: 5,
      commits: 201
    },
    isPublic: true
  },
  {
    id: "37",
    title: "Gospel Choir Harmonies",
    author: "harmony_voices",
    updatedAt: "2024-02-13T09:55:00Z",
    stats: {
      stars: 187,
      tracks: 12,
      collaborators: 12,
      commits: 145
    },
    isPublic: true
  },
  {
    id: "38",
    title: "Hardstyle Kicks Collection",
    author: "hard_hitter",
    updatedAt: "2024-02-12T22:20:00Z",
    stats: {
      stars: 312,
      tracks: 26,
      collaborators: 4,
      commits: 234
    },
    isPublic: true
  },
  {
    id: "39",
    title: "Industrial Noise Textures",
    author: "noise_factory",
    updatedAt: "2024-02-11T15:45:00Z",
    stats: {
      stars: 92,
      tracks: 14,
      collaborators: 3,
      commits: 123
    },
    isPublic: true
  },
  {
    id: "40",
    title: "Salsa Dancing Tracks",
    author: "salsa_king",
    updatedAt: "2024-02-10T19:10:00Z",
    stats: {
      stars: 167,
      tracks: 17,
      collaborators: 6,
      commits: 134
    },
    isPublic: true
  },
  {
    id: "41",
    title: "Vaporwave Aesthetic",
    author: "retro_wave",
    updatedAt: "2024-02-09T10:35:00Z",
    stats: {
      stars: 245,
      tracks: 11,
      collaborators: 2,
      commits: 167
    },
    isPublic: true
  },
  {
    id: "42",
    title: "Ska Punk Energy",
    author: "ska_squad",
    updatedAt: "2024-02-08T17:00:00Z",
    stats: {
      stars: 78,
      tracks: 10,
      collaborators: 5,
      commits: 89
    },
    isPublic: true
  },
  {
    id: "43",
    title: "Trap Soul Vocals",
    author: "trap_soul",
    updatedAt: "2024-02-07T13:25:00Z",
    stats: {
      stars: 356,
      tracks: 22,
      collaborators: 7,
      commits: 278
    },
    isPublic: true
  },
  {
    id: "44",
    title: "Psytrance Forest Sounds",
    author: "forest_trance",
    updatedAt: "2024-02-06T21:50:00Z",
    stats: {
      stars: 198,
      tracks: 15,
      collaborators: 4,
      commits: 156
    },
    isPublic: true
  },
  {
    id: "45",
    title: "Baroque Chamber Music",
    author: "classical_ensemble",
    updatedAt: "2024-02-05T08:15:00Z",
    stats: {
      stars: 123,
      tracks: 9,
      collaborators: 8,
      commits: 201
    },
    isPublic: true
  },
  {
    id: "46",
    title: "Grime MC Beats",
    author: "grime_time",
    updatedAt: "2024-02-04T16:40:00Z",
    stats: {
      stars: 267,
      tracks: 21,
      collaborators: 3,
      commits: 189
    },
    isPublic: true
  },
  {
    id: "47",
    title: "New Wave Synth Pop",
    author: "new_wave",
    updatedAt: "2024-02-03T12:05:00Z",
    stats: {
      stars: 145,
      tracks: 13,
      collaborators: 2,
      commits: 112
    },
    isPublic: true
  },
  {
    id: "48",
    title: "Flamenco Guitar Passion",
    author: "flamenco_fire",
    updatedAt: "2024-02-02T19:30:00Z",
    stats: {
      stars: 89,
      tracks: 7,
      collaborators: 1,
      commits: 67
    },
    isPublic: true
  },
  {
    id: "49",
    title: "Glitch Hop Experiments",
    author: "glitch_artist",
    updatedAt: "2024-02-01T14:55:00Z",
    stats: {
      stars: 234,
      tracks: 16,
      collaborators: 5,
      commits: 178
    },
    isPublic: true
  },
  {
    id: "50",
    title: "Bluegrass Banjo Picking",
    author: "banjo_picker",
    updatedAt: "2024-01-31T10:20:00Z",
    stats: {
      stars: 67,
      tracks: 8,
      collaborators: 3,
      commits: 45
    },
    isPublic: true
  }
];
