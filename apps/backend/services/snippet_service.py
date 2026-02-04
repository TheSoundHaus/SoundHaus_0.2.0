import os
import shutil
import json
import uuid
from pathlib import Path
from typing import Optional, List, BinaryIO
from datetime import datetime

try:
    from mutagen import File as MutagenFile
    HAS_MUTAGEN=True
except ImportError:
    HAS_MUTAGEN=False


class SnippetStorageService:
    def __init__(self, base_path: str = "./storage/snippets"):
        self.base_path = Path(base_path)
        self.base_path.mkdir(parents=True, exist_ok=True)

    def _get_user_path(self, user_id:str) -> Path:
        path = self.base_path / user_id
        path.mkdir(parents=True, exist_ok=True)
        return path
    
    def _get_snippet_path(self,user_id:str, snippet_id:str) -> Path:
        path = self._get_user_path(user_id) / snippet_id
        path.mkdir(parents=True,exist_ok=True)
        return path
    
    def analyze_audio(self, file_path:Path) -> dict:
        metadata = {
            "duration": None,
            "sample_rate": None,
            "channels": None,
            "bit_depth":None
            }
