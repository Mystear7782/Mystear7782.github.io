import { useNavigate } from 'react-router-dom'

/** 体重ログ・食事記録で共通の切り替えタブ */
export function BodyTabs({ active }: { active: 'weight' | 'meal' }) {
  const navigate = useNavigate()
  return (
    <div className="ana-tabs">
      <button
        type="button"
        className={`ana-tab${active === 'weight' ? ' active' : ''}`}
        onClick={() => navigate('/weight')}
      >
        体重
      </button>
      <button
        type="button"
        className={`ana-tab${active === 'meal' ? ' active' : ''}`}
        onClick={() => navigate('/meal')}
      >
        食事
      </button>
    </div>
  )
}
