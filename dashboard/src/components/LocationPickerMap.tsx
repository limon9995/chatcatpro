import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Dhaka center — sensible default when no pin exists yet
const DEFAULT_CENTER: [number, number] = [23.8103, 90.4125];

// Emoji divIcons — avoids Leaflet's default marker images 404-ing under Vite
function emojiIcon(emoji: string, size: number, opacity = 1) {
  return L.divIcon({
    className: '',
    html: `<div style="font-size:${size}px;line-height:1;opacity:${opacity};filter:drop-shadow(0 2px 3px rgba(0,0,0,.4))">${emoji}</div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size - 2],
  });
}

// Free, no-key reverse geocoding — best-effort only. Never blocks the
// confirm flow: a failed/slow lookup just falls back to raw coordinates.
async function reverseGeocode(lat: number, lng: number): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=18&addressdetails=0`,
      { headers: { 'Accept-Language': 'bn,en' }, signal: controller.signal },
    );
    clearTimeout(timeout);
    if (!res.ok) return null;
    const data = await res.json();
    return typeof data?.display_name === 'string' ? data.display_name : null;
  } catch {
    return null;
  }
}

interface LocationPickerMapProps {
  lat: number | null;
  lng: number | null;
  onChange: (lat: number, lng: number) => void;
  height?: number;
  markerEmoji?: string;
  /** Fixed reference marker (e.g. the restaurant pin when picking a customer location) */
  referencePin?: { lat: number; lng: number; emoji?: string } | null;
  /** Radius circle around referencePin (or the marker itself), in km */
  radiusKm?: number | null;
  /**
   * When true, every pick (GPS detect / map click / marker drag) shows a
   * "is this correct?" overview with a reverse-geocoded address before
   * onChange actually fires — nothing is committed until confirmed.
   */
  confirmPick?: boolean;
  /** Heading shown on the confirm overview card. */
  confirmLabel?: string;
}

export default function LocationPickerMap({
  lat,
  lng,
  onChange,
  height = 260,
  markerEmoji = '📍',
  referencePin = null,
  radiusKm = null,
  confirmPick = false,
  confirmLabel = 'এটা কি সঠিক Location?',
}: LocationPickerMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const pendingMarkerRef = useRef<L.Marker | null>(null);
  const circleRef = useRef<L.Circle | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const confirmPickRef = useRef(confirmPick);
  confirmPickRef.current = confirmPick;
  const latRef = useRef(lat);
  latRef.current = lat;
  const lngRef = useRef(lng);
  lngRef.current = lng;
  const [gpsBusy, setGpsBusy] = useState(false);
  const [gpsError, setGpsError] = useState('');
  const [pending, setPending] = useState<{ lat: number; lng: number; fromDrag: boolean } | null>(null);
  const [pendingAddress, setPendingAddress] = useState<string | null>(null);
  const [addressLoading, setAddressLoading] = useState(false);

  const placeMarker = (map: L.Map, la: number, ln: number) => {
    if (!markerRef.current) {
      markerRef.current = L.marker([la, ln], {
        icon: emojiIcon(markerEmoji, 30),
        draggable: true,
      }).addTo(map);
      markerRef.current.on('dragend', () => {
        const ll = markerRef.current!.getLatLng();
        if (confirmPickRef.current) {
          beginPending(ll.lat, ll.lng, true);
        } else {
          onChangeRef.current(ll.lat, ll.lng);
        }
      });
    } else {
      markerRef.current.setLatLng([la, ln]);
    }
  };

  const clearPendingMarker = () => {
    pendingMarkerRef.current?.remove();
    pendingMarkerRef.current = null;
  };

  // Starts (or replaces) an unconfirmed pick — shows the overview card and
  // kicks off a best-effort reverse-geocode. Nothing is saved yet.
  const beginPending = (la: number, ln: number, fromDrag: boolean) => {
    const map = mapRef.current;
    if (!map) return;
    setPending({ lat: la, lng: ln, fromDrag });
    setPendingAddress(null);
    setAddressLoading(true);
    if (!fromDrag) {
      // GPS / map-click pick: show a distinct "unconfirmed" marker so the
      // merchant can compare it against their already-confirmed pin (if any).
      if (!pendingMarkerRef.current) {
        pendingMarkerRef.current = L.marker([la, ln], {
          icon: emojiIcon(markerEmoji, 30, 0.5),
          interactive: false,
        }).addTo(map);
      } else {
        pendingMarkerRef.current.setLatLng([la, ln]);
      }
    }
    // A drag already moves the real marker itself — no second marker needed.
    reverseGeocode(la, ln).then((addr) => {
      setAddressLoading(false);
      setPendingAddress(addr);
    });
  };

  const confirmPending = () => {
    if (!pending || !mapRef.current) return;
    placeMarker(mapRef.current, pending.lat, pending.lng);
    onChangeRef.current(pending.lat, pending.lng);
    clearPendingMarker();
    setPending(null);
    setPendingAddress(null);
  };

  const cancelPending = () => {
    if (pending?.fromDrag) {
      // Snap the real marker back to the last CONFIRMED spot (props are only
      // ever updated by an actual onChange, i.e. a confirmed pick).
      if (latRef.current != null && lngRef.current != null) {
        markerRef.current?.setLatLng([latRef.current, lngRef.current]);
      } else {
        markerRef.current?.remove();
        markerRef.current = null;
      }
    }
    clearPendingMarker();
    setPending(null);
    setPendingAddress(null);
  };

  // Init once
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const center: [number, number] =
      lat != null && lng != null
        ? [lat, lng]
        : referencePin
          ? [referencePin.lat, referencePin.lng]
          : DEFAULT_CENTER;
    const map = L.map(containerRef.current).setView(center, lat != null ? 15 : 13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap',
    }).addTo(map);
    if (referencePin) {
      L.marker([referencePin.lat, referencePin.lng], {
        icon: emojiIcon(referencePin.emoji || '🏪', 26),
        interactive: false,
      }).addTo(map);
    }
    map.on('click', (e: L.LeafletMouseEvent) => {
      if (confirmPickRef.current) {
        beginPending(e.latlng.lat, e.latlng.lng, false);
      } else {
        placeMarker(map, e.latlng.lat, e.latlng.lng);
        onChangeRef.current(e.latlng.lat, e.latlng.lng);
      }
    });
    if (lat != null && lng != null) placeMarker(map, lat, lng);
    mapRef.current = map;
    // Container may have just become visible (modal/section toggle)
    setTimeout(() => map.invalidateSize(), 80);
    return () => {
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
      pendingMarkerRef.current = null;
      circleRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep marker in sync when parent state changes (e.g. loaded from server)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || lat == null || lng == null) return;
    placeMarker(map, lat, lng);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lat, lng]);

  // Radius circle around the reference pin (or the picked point)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (circleRef.current) {
      circleRef.current.remove();
      circleRef.current = null;
    }
    const centerPt = referencePin
      ? [referencePin.lat, referencePin.lng]
      : lat != null && lng != null
        ? [lat, lng]
        : null;
    if (radiusKm && radiusKm > 0 && centerPt) {
      circleRef.current = L.circle(centerPt as [number, number], {
        radius: radiusKm * 1000,
        color: '#059669',
        weight: 1.5,
        fillOpacity: 0.06,
      }).addTo(map);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [radiusKm, referencePin?.lat, referencePin?.lng, lat, lng]);

  const useGps = () => {
    if (!navigator.geolocation) {
      setGpsError('এই browser-এ GPS support নেই — ম্যাপে ক্লিক করে pin করুন');
      return;
    }
    setGpsBusy(true);
    setGpsError('');
    // Watchdog: some browsers/WebViews never fire either native callback even
    // with {timeout} set, leaving the button stuck on "খোঁজা হচ্ছে..." forever.
    let done = false;
    const watchdog = setTimeout(() => {
      if (done) return;
      done = true;
      setGpsBusy(false);
      setGpsError('লোকেশন পেতে বেশি সময় লাগছে — ম্যাপে ক্লিক করে pin করুন');
    }, 12000);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (done) return;
        done = true; clearTimeout(watchdog);
        setGpsBusy(false);
        const { latitude, longitude } = pos.coords;
        mapRef.current?.setView([latitude, longitude], 16);
        if (confirmPickRef.current) {
          beginPending(latitude, longitude, false);
        } else {
          if (mapRef.current) placeMarker(mapRef.current, latitude, longitude);
          onChangeRef.current(latitude, longitude);
        }
      },
      () => {
        if (done) return;
        done = true; clearTimeout(watchdog);
        setGpsBusy(false);
        setGpsError('লোকেশন পাওয়া যায়নি — location permission দিন অথবা ম্যাপে ক্লিক করুন');
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  return (
    <div>
      <div
        ref={containerRef}
        style={{
          height,
          borderRadius: 12,
          overflow: 'hidden',
          border: '1px solid var(--border, #e5e7eb)',
          zIndex: 1,
          position: 'relative',
        }}
      />
      <button
        type="button"
        onClick={useGps}
        disabled={gpsBusy}
        style={{
          marginTop: 8,
          width: '100%',
          padding: '9px 12px',
          borderRadius: 10,
          border: '1px solid #059669',
          background: 'rgba(5,150,105,.08)',
          color: '#059669',
          fontSize: 13,
          fontWeight: 700,
          cursor: gpsBusy ? 'not-allowed' : 'pointer',
          fontFamily: 'inherit',
        }}
      >
        {gpsBusy ? 'লোকেশন খোঁজা হচ্ছে...' : '📍 আমার বর্তমান লোকেশন ব্যবহার করুন (GPS)'}
      </button>
      {gpsError && (
        <div style={{ marginTop: 6, fontSize: 12.5, color: '#dc2626' }}>{gpsError}</div>
      )}
      {pending && (
        <div
          style={{
            marginTop: 8,
            padding: 12,
            borderRadius: 10,
            border: '1.5px solid #059669',
            background: 'rgba(5,150,105,.07)',
          }}
        >
          <div style={{ fontSize: 12.5, fontWeight: 800, color: '#065f46', marginBottom: 4 }}>
            {confirmLabel}
          </div>
          <div style={{ fontSize: 12, color: '#334155', marginBottom: 10, lineHeight: 1.5 }}>
            {addressLoading
              ? 'ঠিকানা খোঁজা হচ্ছে...'
              : pendingAddress || `📍 ${pending.lat.toFixed(5)}, ${pending.lng.toFixed(5)}`}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              onClick={confirmPending}
              style={{
                flex: 1,
                padding: '8px 12px',
                borderRadius: 8,
                border: 'none',
                background: '#059669',
                color: '#fff',
                fontSize: 12.5,
                fontWeight: 700,
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              ✓ হ্যাঁ, এটাই ঠিক
            </button>
            <button
              type="button"
              onClick={cancelPending}
              style={{
                flex: 1,
                padding: '8px 12px',
                borderRadius: 8,
                border: '1px solid var(--border, #e5e7eb)',
                background: 'transparent',
                color: 'inherit',
                fontSize: 12.5,
                fontWeight: 700,
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              ✕ বাতিল / আবার চেষ্টা করুন
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
