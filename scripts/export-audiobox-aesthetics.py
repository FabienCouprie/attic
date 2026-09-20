# scripts/export-audiobox-aesthetics.py — Exporte Audiobox Aesthetics (Meta) en ONNX pour Attic.
#
# À n'exécuter que pour régénérer le modèle ; l'application ne dépend pas de Python.
#
#   python -m venv aes-venv
#   aes-venv/Scripts/python -m pip install "torch==2.11.0" "torchaudio==2.11.0" onnx onnxscript audiobox-aesthetics requests
#   aes-venv/Scripts/python scripts/export-audiobox-aesthetics.py <dossier des poids> <sortie.onnx>
#
# Les poids (config.json, model.safetensors, 415 Mo, CC-BY 4.0) viennent du dépôt Hugging Face
# facebook/audiobox-aesthetics.
#
# Le graphe exporté prend UNE tranche : `wav` [lot, 160000] float32 à 16 kHz mono, et `mask`
# [lot, 160000] bool (vrai sur les échantillons réels) ; il rend `scores` [lot, 4], déjà
# dénormalisés, dans l'ordre CE, CU, PC, PQ. Rééchantillonnage, découpage en tranches et moyenne
# pondérée sont faits par Attic (src/audio/esthetique.ts), à l'identique du code de référence.
#
# Deux retouches, sans effet sur les scores (mesuré : écart max 2e-5 sur 317 tranches) :
# - la normalisation de poids de la convolution de position est figée en poids constant ;
# - les `value_info` de l'export dynamo sont retirés : l'un d'eux annonce une dimension fausse
#   (1 au lieu de 768) et fait échouer l'inférence de formes d'onnx.
#
# Les versions allégées ont été mesurées et écartées : INT8 dynamique complet jusqu'à 5,5 points
# d'écart, INT8 limité au transformer 0,32, FP16 plante onnxruntime au chargement.
import sys
from pathlib import Path

import onnx
import torch
from audiobox_aesthetics.model.aes import AXES_NAME, AesMultiOutput


class Tranche(torch.nn.Module):
    def __init__(self, modele):
        super().__init__()
        self.m = modele
        tt = modele.target_transform
        self.register_buffer("moy", torch.tensor([tt[a]["mean"] for a in AXES_NAME], dtype=torch.float32))
        self.register_buffer("ect", torch.tensor([tt[a]["std"] for a in AXES_NAME], dtype=torch.float32))

    def forward(self, wav, mask):
        p = self.m({"wav": wav.unsqueeze(1), "mask": mask.unsqueeze(1)})
        return torch.stack([p[a] for a in AXES_NAME], dim=-1) * self.ect + self.moy


def main(poids: str, sortie: str) -> None:
    modele = AesMultiOutput.from_pretrained(poids).eval()
    torch.nn.utils.remove_weight_norm(modele.wavlm_model.encoder.pos_conv[0])
    wav = torch.zeros(2, 160000)
    mask = torch.ones(2, 160000, dtype=torch.bool)
    mask[1, 80000:] = False
    lot = torch.export.Dim("lot")
    with torch.inference_mode():
        programme = torch.onnx.export(
            Tranche(modele).eval(), (wav, mask), dynamo=True,
            input_names=["wav", "mask"], output_names=["scores"],
            dynamic_shapes={"wav": {0: lot}, "mask": {0: lot}},
        )
    programme.save(sortie)
    graphe = onnx.load(sortie)
    del graphe.graph.value_info[:]
    onnx.save(graphe, sortie)
    print(f"{sortie} : {Path(sortie).stat().st_size / 1e6:.0f} Mo")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        sys.exit(__doc__ or "usage : export-audiobox-aesthetics.py <poids> <sortie.onnx>")
    main(sys.argv[1], sys.argv[2])
