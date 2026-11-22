"""
grid_mapping.py - Arena Grid Geometry and Cell Coordinate Mappings for Stage 6.

Arena Specifications:
- 6 columns (A-F), 4 rows (1-4)
- 24 cells (A1 through F4)
- 20 cm x 20 cm cells (120 cm x 80 cm total)
- Origin A1 = (0, 0)
- F4 = (5, 3)
- Fixed obstacles: C2 = (2, 1), C3 = (2, 2)
"""

import re
from typing import Dict, List, Tuple, Union, Optional

ARENA_COLS: int = 6
ARENA_ROWS: int = 4
CELL_SIZE_CM: float = 20.0
TOTAL_WIDTH_CM: float = 120.0
TOTAL_HEIGHT_CM: float = 80.0

COL_NAMES: Tuple[str, ...] = ("A", "B", "C", "D", "E", "F")
ROW_NAMES: Tuple[str, ...] = ("1", "2", "3", "4")

# Obstacles: C2 is (2,1) and C3 is (2,2)
OBSTACLE_CELL_IDS: frozenset = frozenset({"C2", "C3"})
OBSTACLE_COORDINATES: frozenset = frozenset({(2, 1), (2, 2)})

_CELL_ID_PATTERN = re.compile(r"^[A-F][1-4]$")


def is_valid_cell_id(cell_id: Optional[str]) -> bool:
    """Check whether a cell ID is valid (A1 through F4)."""
    if not isinstance(cell_id, str):
        return False
    return bool(_CELL_ID_PATTERN.match(cell_id.strip().upper()))


def cell_id_to_coords(cell_id: str) -> Tuple[int, int]:
    """
    Convert alphanumeric cell ID (e.g. 'A1', 'F4') to 0-indexed (x, y) coordinates.
    
    A1 -> (0, 0)
    F4 -> (5, 3)
    Raises ValueError if cell_id is invalid.
    """
    if not isinstance(cell_id, str):
        raise ValueError(f"Cell ID must be a string, got {type(cell_id).__name__}")
    normalized = cell_id.strip().upper()
    if not _CELL_ID_PATTERN.match(normalized):
        raise ValueError(f"Invalid cell ID '{cell_id}'. Must be in range A1 to F4.")
    
    col_char = normalized[0]
    row_char = normalized[1]
    
    x = ord(col_char) - ord("A")
    y = int(row_char) - 1
    return (x, y)


def coords_to_cell_id(x: int, y: int) -> str:
    """
    Convert 0-indexed coordinates (x, y) to cell ID string (e.g. 'A1').
    
    Raises ValueError if coordinates are outside arena boundaries.
    """
    if not isinstance(x, int) or not isinstance(y, int):
        raise ValueError(f"Coordinates must be integers, got ({type(x).__name__}, {type(y).__name__})")
    if not (0 <= x < ARENA_COLS and 0 <= y < ARENA_ROWS):
        raise ValueError(f"Coordinates ({x}, {y}) out of arena bounds [0..{ARENA_COLS-1}, 0..{ARENA_ROWS-1}]")
    
    col_char = chr(ord("A") + x)
    row_char = str(y + 1)
    return f"{col_char}{row_char}"


def cell_center_cm(x: int, y: int) -> Tuple[float, float]:
    """
    Calculate the physical center coordinates (in centimeters) of a grid cell.
    
    Formula:
      center_x = (x + 0.5) * 20.0
      center_y = (y + 0.5) * 20.0
    """
    if not (0 <= x < ARENA_COLS and 0 <= y < ARENA_ROWS):
        raise ValueError(f"Coordinates ({x}, {y}) out of arena bounds")
    center_x = (x + 0.5) * CELL_SIZE_CM
    center_y = (y + 0.5) * CELL_SIZE_CM
    return (round(center_x, 2), round(center_y, 2))


def cell_id_center_cm(cell_id: str) -> Tuple[float, float]:
    """Calculate the physical center of a cell given its alphanumeric ID."""
    x, y = cell_id_to_coords(cell_id)
    return cell_center_cm(x, y)


def is_obstacle(cell_or_coords: Union[str, Tuple[int, int]]) -> bool:
    """
    Return True if the given cell ID or (x, y) coordinate is a fixed obstacle.
    
    Obstacles are C2 (2, 1) and C3 (2, 2).
    """
    if isinstance(cell_or_coords, str):
        if not is_valid_cell_id(cell_or_coords):
            return False
        return cell_or_coords.strip().upper() in OBSTACLE_CELL_IDS
    elif isinstance(cell_or_coords, (tuple, list)) and len(cell_or_coords) == 2:
        return tuple(cell_or_coords) in OBSTACLE_COORDINATES
    return False


def get_all_cells() -> List[Dict]:
    """
    Return metadata dictionary for all 24 cells in row-major order:
    Row 1: A1, B1, C1, D1, E1, F1 (y=0, x=0..5)
    Row 2: A2, B2, C2, D2, E2, F2 (y=1, x=0..5)
    Row 3: A3, B3, C3, D3, E3, F3 (y=2, x=0..5)
    Row 4: A4, B4, C4, D4, E4, F4 (y=3, x=0..5)
    """
    cells = []
    for y in range(ARENA_ROWS):
        for x in range(ARENA_COLS):
            cell_id = coords_to_cell_id(x, y)
            cx, cy = cell_center_cm(x, y)
            cells.append({
                "cell_id": cell_id,
                "x": x,
                "y": y,
                "center_x_cm": cx,
                "center_y_cm": cy,
                "is_obstacle": is_obstacle((x, y))
            })
    return cells
