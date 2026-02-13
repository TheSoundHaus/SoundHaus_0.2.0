import sys
import os

# Add parent directory to path so we can add directly from backend
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from database import SessionLocal, init_db

# Initialize database and import all models first
# This ensures all models are registered before SQLAlchemy configures relationships
init_db()

from models.genre_models import GenreList
from sqlalchemy.exc import SQLAlchemyError


INITIAL_GENRES = [
    {
        "genre_name": "Rock",
        "genre_description": "A broad genre centered around electric guitars, bass, drums, and strong rhythmic drive.",
        "genre_icon": "",
        "genre_color": "#C0392B",
        "display_order": 0,
    }, 
    {
        "genre_name": "Metal",
        "genre_description": "A heavy, aggressive style of rock featuring distorted guitars, powerful riffs, and intense vocals.",
        "genre_icon": "",
        "genre_color": "#2C2C2C",
        "display_order": 1,
    },
    {
        "genre_name": "Jazz",
        "genre_description": "A genre defined by improvisation, swing, complex harmonies, and expressive performance.",
        "genre_icon": "",
        "genre_color": "#8E44AD",
        "display_order": 2,
    },
    {
        "genre_name": "Blues",
        "genre_description": "Rooted in emotional expression, featuring blues scales, call-and-response, and soulful phrasing.",
        "genre_icon": "",
        "genre_color": "#1F618D",
        "display_order": 3,
    },
    {
        "genre_name": "Classical",
        "genre_description": "Orchestral and chamber music traditions spanning centuries with formal structures and notation.",
        "genre_icon": "",
        "genre_color": "#D4AC0D",
        "display_order": 4,
    },
    {
        "genre_name": "Hip Hop",
        "genre_description": "A rhythmic, lyric-driven genre built around beats, sampling, rapping, and urban culture.",
        "genre_icon": "",
        "genre_color": "#27AE60",
        "display_order": 5,
    },
    {
        "genre_name": "Electronic",
        "genre_description": "Music produced primarily using electronic instruments, synthesizers, and digital production.",
        "genre_icon": "",
        "genre_color": "#16A085",
        "display_order": 6,
    },
    {
        "genre_name": "Ambient",
        "genre_description": "Atmospheric and texture-focused music designed to create immersive soundscapes.",
        "genre_icon": "",
        "genre_color": "#5DADE2",
        "display_order": 7,
    },
    {
        "genre_name": "Pop",
        "genre_description": "Catchy, accessible music focused on melody, hooks, and broad audience appeal.",
        "genre_icon": "",
        "genre_color": "#F1948A",
        "display_order": 8,
    },
    {
        "genre_name": "Funk",
        "genre_description": "Groove-driven music emphasizing basslines, syncopation, and rhythmic interplay.",
        "genre_icon": "",
        "genre_color": "#AF601A",
        "display_order": 9,
    },
    {
        "genre_name": "Soul",
        "genre_description": "Emotionally expressive music blending gospel, rhythm and blues, and jazz influences.",
        "genre_icon": "",
        "genre_color": "#6E2C00",
        "display_order": 10,
    },
    {
        "genre_name": "Reggae",
        "genre_description": "A Jamaican genre characterized by offbeat rhythms, relaxed grooves, and social themes.",
        "genre_icon": "",
        "genre_color": "#239B56",
        "display_order": 11,
    },
    {
        "genre_name": "Folk",
        "genre_description": "Acoustic-based music rooted in traditional storytelling and cultural heritage.",
        "genre_icon": "",
        "genre_color": "#7D6608",
        "display_order": 12,
    },
    {
        "genre_name": "Punk",
        "genre_description": "Fast, raw, and rebellious music emphasizing simplicity and anti-establishment themes.",
        "genre_icon": "",
        "genre_color": "#922B21",
        "display_order": 13,
    },
    {
        "genre_name": "Experimental",
        "genre_description": "Music that challenges conventions through unconventional structures, sounds, and techniques.",
        "genre_icon": "",
        "genre_color": "#566573",
        "display_order": 14,
    },
]

def seed_genres():
    db = SessionLocal()
    try:
        added_count = 0
        skipped_count = 0

        for genre in INITIAL_GENRES:
            existing = db.query(GenreList).filter(
                GenreList.genre_name == genre["genre_name"]
            ).first()

            if existing is None:
                new_genre = GenreList(**genre)
                db.add(new_genre)
                added_count += 1
                print(f"added: {genre['genre_name']} to genre list!")
            else:
                skipped_count += 1
                print(f"skipped: {genre['genre_name']}, it already exists")
        db.commit()
        print(f"\n Added {added_count} and skipped {skipped_count}")
    except Exception as e:
        db.rollback()
        print(f"\n Unexpected error {e}")
        raise
    finally:
        db.close()


def main():
    print("seeding genres in database")
    try:
        seed_genres()
        print("successfully seeded!")
    except Exception as e:
        print(f"\n Seeding failed: {e}")
        sys.exit(1) 

if __name__ == "__main__":
    main()
