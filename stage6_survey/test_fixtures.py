"""
test_fixtures.py - Synthetic Test Fixtures for Stage 6 Development and Unit Testing.

MARKER: TEST_FIXTURE
All data generated here is synthetic mock data for software testing only.
DO NOT use in place of real hardware telemetry.
"""

from typing import Dict, Any, List, Optional
import time

DATA_SOURCE_FIXTURE: str = "TEST_FIXTURE"
POSITION_METHOD_MANUAL: str = "MANUAL_CONFIRMED"


def create_synthetic_packet(
    sequence_number: int,
    rssi_dbm: Optional[float] = -65.0,
    snr_db: Optional[float] = 9.5,
    left_encoder_rate: Optional[float] = 12.0,
    right_encoder_rate: Optional[float] = 12.2,
    ax: Optional[float] = 0.02,
    ay: Optional[float] = -0.01,
    az: Optional[float] = 1.00,
    gz: Optional[float] = 0.0,
    left_pwm: Optional[int] = 0,
    right_pwm: Optional[int] = 0,
    antenna_configuration: Optional[str] = "DEFAULT_MONOPOLE"
) -> Dict[str, Any]:
    """
    Generate a single synthetic telemetry packet for test validation.
    Explicitly marked as TEST_FIXTURE.
    """
    return {
        "sequence_number": sequence_number,
        "rssi_dbm": rssi_dbm,
        "snr_db": snr_db,
        "left_encoder_rate": left_encoder_rate,
        "right_encoder_rate": right_encoder_rate,
        "ax": ax,
        "ay": ay,
        "az": az,
        "gz": gz,
        "left_pwm": left_pwm,
        "right_pwm": right_pwm,
        "antenna_configuration": antenna_configuration,
        "_test_fixture": True,
        "_fixture_marker": DATA_SOURCE_FIXTURE
    }


def generate_packet_burst(
    start_seq: int,
    count: int,
    base_rssi: float = -70.0,
    base_snr: float = 8.0,
    packet_loss_indices: Optional[List[int]] = None
) -> List[Dict[str, Any]]:
    """
    Generate a burst of synthetic packets from start_seq to start_seq + count - 1.
    Allows simulating packet loss by omitting specified sequence offsets.
    """
    loss_set = set(packet_loss_indices or [])
    packets = []
    
    for i in range(count):
        if i in loss_set:
            continue  # Simulate dropped packet
        
        seq = start_seq + i
        # Subtle synthetic noise
        rssi = base_rssi + ((i % 5) - 2) * 1.5
        snr = base_snr + ((i % 3) - 1) * 0.8
        
        pkt = create_synthetic_packet(
            sequence_number=seq,
            rssi_dbm=round(rssi, 1),
            snr_db=round(snr, 1)
        )
        packets.append(pkt)
    
    return packets
