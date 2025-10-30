import { useCallback, useMemo, useRef, useState } from 'react';
import styles from './redrocks.module.css';

type Pin = {
  id: string;
  // percentage positions relative to base image (0-100)
  xPercent: number;
  yPercent: number;
};

const SAMPLE_PINS: Pin[] = [
  { id: 'p1', xPercent: 28, yPercent: 47 },
  { id: 'p2', xPercent: 38, yPercent: 34 },
  { id: 'p3', xPercent: 50, yPercent: 28 },
  { id: 'p4', xPercent: 63, yPercent: 36 },
  { id: 'p5', xPercent: 70, yPercent: 52 },
  { id: 'p6', xPercent: 58, yPercent: 61 },
  { id: 'p7', xPercent: 42, yPercent: 63 },
  { id: 'p8', xPercent: 32, yPercent: 56 },
];

export default function RedRocksMap() {
  const [hoveredPinId, setHoveredPinId] = useState<string | null>(null);
  const [activePinId, setActivePinId] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const dragRef = useRef<{ startX: number; startY: number; startOffsetX: number; startOffsetY: number } | null>(null);

  const onWheel = useCallback((e: React.WheelEvent) => {
    if (!activePinId) return;
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.2 : 0.2;
    setZoom((z) => Math.max(1, Math.min(5, parseFloat((z + delta).toFixed(2)))));
  }, [activePinId]);

  const startDrag = useCallback((e: React.MouseEvent) => {
    if (!activePinId) return;
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      startOffsetX: offset.x,
      startOffsetY: offset.y,
    };
  }, [activePinId, offset.x, offset.y]);

  const duringDrag = useCallback((e: React.MouseEvent) => {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    setOffset({ x: dragRef.current.startOffsetX + dx, y: dragRef.current.startOffsetY + dy });
  }, []);

  const stopDrag = useCallback(() => {
    dragRef.current = null;
  }, []);

  const openModal = useCallback((pinId: string) => {
    setActivePinId(pinId);
    setZoom(1.2); // initial 20% zoom per spec
    setOffset({ x: 0, y: 0 });
  }, []);

  const closeModal = useCallback(() => {
    setActivePinId(null);
    setZoom(1);
    setOffset({ x: 0, y: 0 });
  }, []);

  const pins = useMemo(() => SAMPLE_PINS, []);

  return (
    <div className={styles.pageRoot}>
      <div className={styles.mapWrapper}>
        <img
          className={styles.mapImage}
          src="/redrocksmap_.png"
          alt="Red Rocks map"
        />
        {pins.map((pin) => (
          <button
            key={pin.id}
            className={styles.pinButton}
            style={{ left: `${pin.xPercent}%`, top: `${pin.yPercent}%` }}
            onMouseEnter={() => setHoveredPinId(pin.id)}
            onMouseLeave={() => setHoveredPinId((id) => (id === pin.id ? null : id))}
            onClick={() => openModal(pin.id)}
            aria-label={`Open view for pin ${pin.id}`}
          >
            <img
              className={hoveredPinId === pin.id ? styles.pinImgHover : styles.pinImg}
              src="/pin.png"
              alt="pin"
              draggable={false}
            />

            {hoveredPinId === pin.id && (
              <div className={styles.hoverCard}>
                <div className={styles.hoverBadge}>CHEAPEST</div>
                <div className={styles.hoverImageWrap}>
                  <img src="/Master Geometry Reference.jpg" alt="preview" />
                </div>
              </div>
            )}
          </button>
        ))}
      </div>

      {activePinId && (
        <div className={styles.modalOverlay} onClick={closeModal}>
          <div className={styles.modalFrame} onClick={(e) => e.stopPropagation()}>
            <button className={styles.closeBtn} aria-label="Close" onClick={closeModal}>×</button>
            <div className={styles.modalNote}>Click to zoom 20%. Click and drag to move.</div>
            <div
              className={styles.modalImageViewport}
              onWheel={onWheel}
              onMouseDown={startDrag}
              onMouseMove={duringDrag}
              onMouseUp={stopDrag}
              onMouseLeave={stopDrag}
              onClick={() => setZoom((z) => Math.max(1, Math.min(5, parseFloat((z + 0.2).toFixed(2))))) }
              role="img"
              aria-label="Zoomable image"
            >
              <img
                src="/Master Geometry Reference.jpg"
                alt="detail"
                className={styles.modalImage}
                style={{ transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom})` }}
                draggable={false}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


