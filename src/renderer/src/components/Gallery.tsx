import { useState } from 'react'
import type { GeneratedImage, HistoryEntry } from '@shared/types'

interface Props {
  images: GeneratedImage[]
  history: HistoryEntry[]
  onClearHistory: () => void
  onLoadJson: (json: unknown) => void
}

export function Gallery({ images, history, onClearHistory, onLoadJson }: Props): React.JSX.Element {
  const [tab, setTab] = useState<'session' | 'history'>('session')
  const [preview, setPreview] = useState<GeneratedImage | null>(null)

  return (
    <>
      <div className="tabs">
        <button className={tab === 'session' ? 'active' : ''} onClick={() => setTab('session')}>
          生成結果 ({images.length})
        </button>
        <button className={tab === 'history' ? 'active' : ''} onClick={() => setTab('history')}>
          履歴 ({history.length})
        </button>
        <div className="spacer" />
        {tab === 'history' && history.length > 0 && (
          <button className="ghost small" onClick={onClearHistory}>
            消去
          </button>
        )}
      </div>
      {tab === 'session' ? (
        <div className="grid">
          {images.length === 0 && <div className="muted">まだ生成された画像はありません。</div>}
          {images.map((img) => (
            <Thumb key={img.path} img={img} onClick={() => setPreview(img)} />
          ))}
        </div>
      ) : (
        <div className="history">
          {history.length === 0 && <div className="muted">履歴はありません。</div>}
          {history.map((h) => (
            <div key={h.id} className="history-item">
              <div className="history-head">
                <span className="muted">{new Date(h.createdAt).toLocaleString('ja-JP')}</span>
                <span className="tag">{h.provider}</span>
                <div className="spacer" />
                <button className="ghost small" onClick={() => onLoadJson(h.json)}>
                  JSON を開く
                </button>
              </div>
              <div className="history-instruction">{h.instruction}</div>
              <div className="grid small">
                {h.images.map((img) => (
                  <Thumb key={img.path} img={img} onClick={() => setPreview(img)} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
      {preview && (
        <div className="lightbox" onClick={() => setPreview(null)}>
          <img src={window.api.localUrl(preview.path)} alt={preview.name} />
          <div className="lightbox-bar" onClick={(e) => e.stopPropagation()}>
            <span>
              {preview.name} · {preview.width}×{preview.height} · seed {preview.seed}
            </span>
            <div className="spacer" />
            <button onClick={() => void window.api.showItem(preview.path)}>フォルダで表示</button>
            <button onClick={() => void window.api.openPath(preview.path)}>開く</button>
            <button onClick={() => void window.api.openPath(preview.requestPath)}>JSON</button>
            <button onClick={() => setPreview(null)}>閉じる</button>
          </div>
        </div>
      )}
    </>
  )
}

function Thumb({ img, onClick }: { img: GeneratedImage; onClick: () => void }): React.JSX.Element {
  return (
    <div className="thumb" onClick={onClick} title={`${img.name}\nseed: ${img.seed}\n${img.path}`}>
      <img src={window.api.localUrl(img.path)} alt={img.name} loading="lazy" />
      <div className="thumb-label">{img.name}</div>
    </div>
  )
}
