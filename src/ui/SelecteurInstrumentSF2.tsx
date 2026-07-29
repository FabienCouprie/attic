// ui/SelecteurInstrumentSF2.tsx — Sélecteur d'instrument depuis le SoundFont global.
import { useEffect, useState } from "react";
import { useI18n } from "../i18n";
import { listerPresetsSF2, sf2Chargee } from "../plugins/soundfontGlobal";

interface Props {
  value: number;
  onChange: (v: number) => void;
  disabled?: boolean;
}

function labelPreset(banque: number, programme: number, nom: string) {
  return banque === 0 ? `${programme}. ${nom}` : `${banque}.${programme}. ${nom}`;
}

export function SelecteurInstrumentSF2({ value, onChange, disabled }: Props) {
  const { t } = useI18n();
  const [options, setOptions] = useState<{ valeur: number; banque: number; programme: number; nom: string }[]>([]);
  const [hasSf2, setHasSf2] = useState(false);

  useEffect(() => {
    function refresh() {
      setHasSf2(!!sf2Chargee());
      setOptions(listerPresetsSF2());
    }
    refresh();
    const id = setInterval(refresh, 1000);
    return () => clearInterval(id);
  }, []);

  const valeur = options.some((o) => o.valeur === value) ? value : (options[0]?.valeur ?? 0);
  return (
    <select
      className="inspecteur-sf2"
      value={valeur}
      disabled={disabled || !hasSf2 || options.length === 0}
      onChange={(e) => onChange(Number(e.target.value))}
    >
      {!hasSf2 ? (
        <option value="0">{t("inspecteur.sf2NonCharge")}</option>
      ) : options.length === 0 ? (
        <option value="0">{t("inspecteur.sf2AucunPreset")}</option>
      ) : (
        options.map((o) => (
          <option key={o.valeur} value={o.valeur}>
            {labelPreset(o.banque, o.programme, o.nom)}
          </option>
        ))
      )}
    </select>
  );
}
