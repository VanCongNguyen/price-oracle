"""LSTM architecture shared by training and inference."""

import torch
from torch import nn

from app.preprocessing import MAX_HORIZON

SEQ_LEN = 30


class PriceLSTM(nn.Module):
    def __init__(self, input_size: int = 1, hidden_size: int = 64, num_layers: int = 2):
        super().__init__()
        self.lstm = nn.LSTM(
            input_size=input_size,
            hidden_size=hidden_size,
            num_layers=num_layers,
            batch_first=True,
            dropout=0.2 if num_layers > 1 else 0.0,
        )
        # Predicts all MAX_HORIZON future days in one forward pass instead of one
        # day at a time, so the forecast doesn't feed predicted days back in as
        # input for the next (which compounds error the further out it goes).
        self.head = nn.Linear(hidden_size, MAX_HORIZON)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        out, _ = self.lstm(x)
        last_step = out[:, -1, :]
        return self.head(last_step)
