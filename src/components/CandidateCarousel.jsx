import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import CandidateOptionCard from "./CandidateOptionCard.jsx";

function compactIndexes(total, current) {
  if (total <= 10) return Array.from({ length: total }, (_, index) => index);
  const indexes = new Set([0, total - 1, current, current - 1, current + 1]);
  if (current < 4) [1, 2, 3, 4].forEach((item) => indexes.add(item));
  if (current > total - 5) [total - 5, total - 4, total - 3, total - 2].forEach((item) => indexes.add(item));
  return [...indexes].filter((item) => item >= 0 && item < total).sort((a, b) => a - b);
}

export default function CandidateCarousel({ candidates = [], selectedCandidateId, userFeatures, onSelectCandidate }) {
  const safeCandidates = Array.isArray(candidates) ? candidates : [];
  const selectedIndex = Math.max(0, safeCandidates.findIndex((candidate) => candidate.id_idae === selectedCandidateId));
  const [currentIndex, setCurrentIndex] = useState(selectedIndex);
  const current = safeCandidates[currentIndex] || safeCandidates[0] || null;
  const indexes = useMemo(() => compactIndexes(safeCandidates.length, currentIndex), [safeCandidates.length, currentIndex]);

  useEffect(() => {
    const nextIndex = safeCandidates.findIndex((candidate) => candidate.id_idae === selectedCandidateId);
    if (nextIndex >= 0) setCurrentIndex(nextIndex);
  }, [selectedCandidateId, safeCandidates]);

  function goTo(index) {
    const bounded = Math.max(0, Math.min(index, safeCandidates.length - 1));
    setCurrentIndex(bounded);
    const candidate = safeCandidates[bounded];
    if (candidate) onSelectCandidate?.(candidate);
  }

  if (!current) return <p className="muted">No hay candidatos disponibles.</p>;

  return (
    <div className="candidate-carousel">
      {safeCandidates.length > 1 && (
        <div className="candidate-carousel-nav">
          <button className="ghost small" disabled={currentIndex <= 0} onClick={() => goTo(currentIndex - 1)}><ChevronLeft size={16} /> Anterior</button>
          <strong>Candidato {currentIndex + 1} de {safeCandidates.length}</strong>
          <button className="ghost small" disabled={currentIndex >= safeCandidates.length - 1} onClick={() => goTo(currentIndex + 1)}>Siguiente <ChevronRight size={16} /></button>
        </div>
      )}
      {safeCandidates.length > 1 && (
        <div className="candidate-indexes" aria-label="Ir a candidato">
          {indexes.map((index, position) => (
            <span key={index} className="candidate-index-wrap">
              {position > 0 && index - indexes[position - 1] > 1 && <span className="muted">...</span>}
              <button className={`small ${index === currentIndex ? "" : "ghost"}`} onClick={() => goTo(index)}>{index + 1}</button>
            </span>
          ))}
        </div>
      )}
      <CandidateOptionCard candidate={current} userFeatures={userFeatures} selected hideAction />
    </div>
  );
}
