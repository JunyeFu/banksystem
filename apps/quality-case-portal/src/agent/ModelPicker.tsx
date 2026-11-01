import { Button, Dropdown } from 'antd';
import { type Model } from './turn';
import check from './assets/model-selected.svg';
import down from './assets/down.svg';
import settings from './assets/settings.svg';

export function ModelPicker({ models, selected, unavailable, disabled, onSelect, onConfigure }: {
  models: Model[]; selected?: Model; unavailable: boolean; disabled: boolean;
  onSelect: (model: Model) => void; onConfigure: () => void;
}) {
  const choices = models.filter(model => model.keyConfigured);
  return <Dropdown trigger={['click']} placement="topLeft" overlayClassName="hz-agent-model-menu" menu={{
    selectable: true, selectedKeys: selected ? [`${selected.id}:${selected.version}`] : [],
    items: [
      { key: 'title', label: '选择模型', disabled: true },
      ...choices.map(model => ({ key: `${model.id}:${model.version}`, label: <span className="hz-agent__model-option"><span>{model.displayName}</span>{model.id === selected?.id && model.version === selected.version && <span className="hz-agent__model-icon"><img src={check} width="24" height="24" alt="已选择" /></span>}</span>, onClick: () => onSelect(model) })),
      ...(!choices.length ? [{ key: 'empty', label: '尚未配置模型', disabled: true }] : []),
      { key: 'custom', label: <span className="hz-agent__model-option"><span>自定义模型</span><span>配置</span></span>, onClick: onConfigure },
      { type: 'divider' },
      { key: 'configure', label: '模型配置', icon: <img src={settings} width="16" height="16" alt="" />, onClick: onConfigure },
      { key: 'hint', label: '切换仅作用于后续任务。', disabled: true },
    ],
  }}>
    <Button type="text" className="hz-agent__model-picker" aria-label="选择下一任务模型" disabled={disabled}>
      <span>{selected?.displayName ?? (unavailable ? '所选版本不可用，请重新选择' : '配置模型')}</span><span className="hz-agent__model-chevron"><img src={down} width="24" height="24" alt="" /></span>
    </Button>
  </Dropdown>;
}
