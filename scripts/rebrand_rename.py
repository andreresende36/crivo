import os
import re

ROOT_DIR = "/Users/andreresende/Apps/garimpou"
EXCLUDE_DIRS = {".git", ".venv", "node_modules", ".next", "__pycache__", ".pytest_cache", "debug", ".claude"}

REPLACEMENTS = {
    "garimpou.app": "garimpou.app",
    "Garimpou": "Garimpou",
    "garimpou": "garimpou",
    "GARIMPOU": "GARIMPOU",
    "GARIMPOU": "GARIMPOU",
    "garimpou": "garimpou",
    "garimpou": "garimpou",
    "Garimpou": "Garimpou",
    "garimpou": "garimpou",
    "Garimpou": "Garimpou",
}

def replace_in_content(content):
    new_content = content
    for old, new in REPLACEMENTS.items():
        new_content = new_content.replace(old, new)
    return new_content

def process_files():
    files_changed = 0
    for root, dirs, files in os.walk(ROOT_DIR, topdown=True):
        dirs[:] = [d for d in dirs if d not in EXCLUDE_DIRS]
        
        for file in files:
            if file == ".DS_Store" or file.endswith((".pyc", ".png", ".jpg", ".jpeg", ".ico", ".svg")):
                continue
            
            filepath = os.path.join(root, file)
            try:
                with open(filepath, 'r', encoding='utf-8') as f:
                    content = f.read()
                
                new_content = replace_in_content(content)
                if new_content != content:
                    with open(filepath, 'w', encoding='utf-8') as f:
                        f.write(new_content)
                    print(f"Updated content in {filepath}")
                    files_changed += 1
            except UnicodeDecodeError:
                # Skip binary files
                pass
            except Exception as e:
                print(f"Error reading {filepath}: {e}")
                
    print(f"Total files updated: {files_changed}")

def rename_paths():
    paths_renamed = 0
    # Bottom-up to not mess up paths
    for root, dirs, files in os.walk(ROOT_DIR, topdown=False):
        # Exclude directories conditionally here if needed, but topdown=False means we can't prune easily.
        # So we skip if it contains any EXCLUDE_DIRS in path
        if any(ex in root.split(os.sep) for ex in EXCLUDE_DIRS):
            continue
            
        for name in files + dirs:
            new_name = replace_in_content(name)
            if new_name != name:
                old_path = os.path.join(root, name)
                new_path = os.path.join(root, new_name)
                os.rename(old_path, new_path)
                print(f"Renamed {old_path} to {new_path}")
                paths_renamed += 1
                
    print(f"Total paths renamed: {paths_renamed}")

if __name__ == "__main__":
    print("Starting content replacement...")
    process_files()
    print("Starting path renaming...")
    rename_paths()
    print("Done.")
