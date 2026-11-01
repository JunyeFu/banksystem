import { useCallback, useEffect, useRef, useState } from 'react';
import { type AgentClient } from './api';
import { historyError } from './history';
import { type Model } from './turn';
import { selectModel, type ModelSelection } from './models';

export function useModels(client: AgentClient, connected: boolean, epoch: number) {
  const [models, setModels] = useState<Model[]>([]), [selection, setSelection] = useState<ModelSelection>();
  const [loading, setLoading] = useState(true), [error, setError] = useState('');
  const [loaded, setLoaded] = useState(false);
  const generation = useRef(0);
  const reload = useCallback(async () => {
    const request = ++generation.current;
    setLoading(true); setError('');
    try {
      const result = await client.request('listAgentModels', {});
      if (generation.current !== request) return;
      setModels(result.models); setLoaded(true); return result.models;
    } catch (failure) { if (generation.current === request) { setModels([]); setError(historyError(failure).code); } }
    finally { if (generation.current === request) setLoading(false); }
  }, [client]);
  useEffect(() => {
    if (connected) void reload();
    else { setModels([]); setLoading(false); setLoaded(false); }
    return () => { generation.current++; };
  }, [connected, epoch, reload]);
  return { models, selected: selectModel(models, selection), unavailable: !!selection && !selectModel(models, selection), loading: loading || connected && !loaded && !error, error, reload,
    select: (model: Model) => setSelection({ id: model.id, version: model.version }) };
}
