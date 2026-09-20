import { useState } from 'react'
import type { GeneratedImage, HistoryEntry } from '@shared/types'
import { IconBraces, IconClock, IconClose, IconFolder, IconImage, IconOpen, IconTrash } from './Icons'

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
      <div className="tabbar">
        <button className={`tab ${tab === 'session' ? 'active' : ''}`} onClick={() => setTab('session')}>
          <IconImage width={14} height={14} /> 生成結果
          <span className="tab-count">{images.length}</span>
        </button>
        <button className={`tab ${tab === 'history' ? 'active' : ''}`} onClick={() => setTab('history')}>
          <IconClock width={14} height={14} /> 履歴
          <span className="tab-count">{history.length}</span>
        </button>
        <div className="spacer" />
        {tab === 'history' && history.length > 0 && (
          <button className="icon-btn sm" title="履歴を消去" onClick={onClearHistory}>
            <IconTrash width={14} height={14} />
          </button>
        )}
      </div>
      {tab === 'session' ? (
        <div className="grid">
          {images.length === 0 && (
            <div className="empty-state span-all">
              <IconImage width={28} height={28} />
              <p>生成した画像がここに並びます。</p>
            </div>
          )}
          {images.map((img) => (
            <Thumb key={img.path} img={img} onClick={() => setPreview(img)} />
          ))}
        </div>
      ) : (
        <div className="history">
          {history.length === 0 && (
            <div className="empty-state">
              <IconClock width={28} height={28} />
              <p>履歴はありません。</p>
            </div>
          )}
          {history.map((h) => (
            <div key={h.id} className="history-item">
              <div className="history-head">
                <span className="hint">{new Date(h.createdAt).toLocaleString('ja-JP')}</span>
                <span className="tag">{h.provider}</span>
                <div className="spacer" />
                <button className="btn btn-xs" onClick={() => onLoadJson(h.json)}>
                  <IconBraces width={12} height={12} /> JSON
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
            <span className="lightbox-meta">
              <b>{preview.name}</b>
              <span>
                {preview.width}×{preview.height} · seed {preview.seed}
              </span>
            </span>
            <div className="spacer" />
            <button className="btn btn-sm" onClick={() => void window.api.showItem(preview.path)}>
              <IconFolder width={14} height={14} /> フォルダ
            </button>
            <button className="btn btn-sm" onClick={() => void window.api.openPath(preview.path)}>
              <IconOpen width={14} height={14} /> 開く
            </button>
            <button className="btn btn-sm" onClick={() => void window.api.openPath(preview.requestPath)}>
              <IconBraces width={14} height={14} /> JSON
            </button>
            <button className="icon-btn" title="閉じる" onClick={() => setPreview(null)}>
              <IconClose />
            </button>
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
