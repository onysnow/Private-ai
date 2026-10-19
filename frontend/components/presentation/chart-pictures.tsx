'use client';
// Before and after (backend/app/visuals/echarts.py, _before_after): two dated
// pictures of one place, held as evidence. The frame -- the title, the
// subtitle that states both dates, the source line -- is the checked
// ECharts option drawn as every other kind is; the pictures sit in the area
// between, laid out as the chart's style says: a slider (react-compare-slider:
// a divider dragged with the pointer, or moved with the arrow keys as an ARIA
// slider), side by side, or stacked. The exports place them side by side or
// stacked (a page cannot slide). Each picture is fetched through the API
// client (the API takes a bearer token an <img src> cannot send) and shown
// whole, never cropped: what the picture shows is the evidence.
import {useQuery} from '@tanstack/react-query';
import type {EChartsOption} from 'echarts';
import {useEffect, useMemo, useState} from 'react';
import type {CSSProperties, ReactElement} from 'react';
import {ReactCompareSlider} from 'react-compare-slider';

import {Chart} from '../charts/chart';
import {api} from '../../lib/api-instance';

/** One picture as the option carries it. */
export type PictureItem = {role: 'before' | 'after'; document_id: string; label: string; taken: string; caption: string | null};
export type PicturesOption = {layout: 'slider' | 'side_by_side' | 'stacked'; divider: number; items: PictureItem[]; top: number; bottom: number};

/** The option's pictures, or null when the option is not a picture pair's. */
export function picturesOf(option: unknown): PicturesOption | null {
  const pictures = (option as {pictures?: unknown} | null)?.pictures;
  if (!pictures || typeof pictures !== 'object' || !Array.isArray((pictures as PicturesOption).items)) return null;
  return pictures as PicturesOption;
}

/** A picture's bytes as a URL the page can show, while it is shown. */
function usePictureUrl(documentId: string): {url: string | null; error: string | null} {
  const picture = useQuery({queryKey: ['document-picture', documentId], queryFn: () => api.blob(`/api/documents/${documentId}/picture`),
    staleTime: Infinity});
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!picture.data) return;
    const made = URL.createObjectURL(picture.data);
    setUrl(made);
    return () => URL.revokeObjectURL(made);
  }, [picture.data]);
  return {url, error: picture.error ? String((picture.error as Error).message || picture.error) : null};
}

const WHOLE: CSSProperties = {width: '100%', height: '100%', objectFit: 'contain', display: 'block'};
const CAPTION: CSSProperties = {fontSize: 14, fontWeight: 600, color: '#1F1B16', textAlign: 'center', padding: '4px 0', lineHeight: 1.2};

function Picture({item}: {item: PictureItem}): ReactElement {
  const {url, error} = usePictureUrl(item.document_id);
  const alt = `${item.role === 'before' ? 'Before' : 'After'}: ${item.label}, taken ${item.taken}`;
  if (error) return <p role="alert" style={{margin: 0, padding: 16, fontSize: 14}}>The {item.role} picture could not be shown: {error}</p>;
  // A blob: URL of the fetched picture: next/image optimises files a server hosts, which this is not.
  // eslint-disable-next-line @next/next/no-img-element
  return url ? <img src={url} alt={alt} style={WHOLE} data-testid={`picture-${item.role}`}/> : <div aria-busy="true" style={WHOLE}/>;
}

function Pictures({pictures}: {pictures: PicturesOption}): ReactElement {
  const [before, after] = pictures.items;
  if (pictures.layout === 'slider') {
    // The dates in a row above the slider, the earlier on the left as the earlier picture is: over the
    // pictures they would cover part of what the pictures show.
    return <div style={{display: 'flex', flexDirection: 'column', width: '100%', height: '100%'}} data-testid="pictures-slider">
      {(before.caption || after.caption) && <div style={{display: 'flex', justifyContent: 'space-between', ...CAPTION}}>
        <span>{before.caption ? `◀ ${before.caption}` : ''}</span><span>{after.caption ? `${after.caption} ▶` : ''}</span>
      </div>}
      <ReactCompareSlider itemOne={<Picture item={before}/>} itemTwo={<Picture item={after}/>} defaultPosition={pictures.divider}
        keyboardIncrement="5%" style={{width: '100%', flex: 1, minHeight: 0}}/>
    </div>;
  }
  const stacked = pictures.layout === 'stacked';
  return <div style={{display: 'flex', flexDirection: stacked ? 'column' : 'row', gap: 12, width: '100%', height: '100%'}}
    data-testid={stacked ? 'pictures-stacked' : 'pictures-side-by-side'}>
    {[before, after].map(item => <figure key={item.role} style={{flex: 1, minWidth: 0, minHeight: 0, margin: 0, display: 'flex', flexDirection: 'column'}}>
      <div style={{flex: 1, minHeight: 0}}><Picture item={item}/></div>
      {item.caption && <figcaption style={CAPTION}>{item.caption}</figcaption>}
    </figure>)}
  </div>;
}

/** The picture pair at its design size: the frame, and the pictures in the area the option gives them. */
export function ChartPictures({option, width, height, ariaLabel}: {option: Record<string, unknown>; width: number; height: number; ariaLabel: string}): ReactElement {
  const pictures = picturesOf(option);
  const frame = useMemo(() => Object.fromEntries(Object.entries(option).filter(([key]) => key !== 'pictures')) as EChartsOption, [option]);
  return <div style={{position: 'relative', width, height}}>
    <Chart option={frame} height={height} ariaLabel={ariaLabel} theme={null}/>
    {pictures && pictures.items.length === 2 && <div style={{position: 'absolute', left: 0, right: 0, top: pictures.top, bottom: pictures.bottom}}>
      <Pictures pictures={pictures}/>
    </div>}
  </div>;
}
