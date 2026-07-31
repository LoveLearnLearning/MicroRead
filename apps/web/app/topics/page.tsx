"use client";

import { Check, FolderPlus, Hash, Plus, Save, X } from "lucide-react";
import { useLiveQuery } from "dexie-react-hooks";
import { FormEvent, useMemo, useState } from "react";
import type { AnnotationColor, Topic } from "@reader/domain";
import { DEFAULT_WORKSPACE_ID, createId, nowIso } from "@reader/domain";
import { AppShell } from "@/components/app-shell";
import { db, putTopic, updateSource } from "@/lib/db";
import { clampText } from "@/lib/format";

const colors: AnnotationColor[] = ["amber", "mint", "blue", "rose", "violet"];

export default function TopicsPage() {
  const topics = useLiveQuery(() => db.topics.orderBy("updatedAt").reverse().toArray(), [], []);
  const sources = useLiveQuery(() => db.sources.filter((source) => source.libraryState === "LIBRARY").toArray(), [], []);
  const [creating, setCreating] = useState(false);
  const [selectedTopic, setSelectedTopic] = useState<Topic | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState<AnnotationColor>("amber");

  async function createTopic(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    const timestamp = nowIso();
    await putTopic({ id: createId(), workspaceId: DEFAULT_WORKSPACE_ID, name: name.trim(), description: description.trim(), color, createdAt: timestamp, updatedAt: timestamp });
    setCreating(false); setName(""); setDescription("");
  }

  const selectedSources = useMemo(() => selectedTopic ? sources.filter((source) => source.topicIds.includes(selectedTopic.id)) : [], [selectedTopic, sources]);

  async function toggleSource(topic: Topic, sourceId: string) {
    const source = sources.find((item) => item.id === sourceId);
    if (!source) return;
    const topicIds = source.topicIds.includes(topic.id) ? source.topicIds.filter((id) => id !== topic.id) : [...source.topicIds, topic.id];
    await updateSource(source.id, { topicIds });
  }

  return (
    <AppShell>
      <div className="page">
        <div className="page-inner">
          <header className="page-header"><div className="page-heading"><span className="eyebrow">COLLECTIONS</span><h1>专题</h1><p>按研究问题或学习目标组织资料，一份资料可以属于多个专题。</p></div><div className="header-actions"><button className="primary-button" onClick={() => setCreating(true)}><Plus size={16} /> 新建专题</button></div></header>
          {!topics.length ? <section className="empty-state"><span className="empty-state-icon"><FolderPlus size={27} /></span><h2>建立第一个专题</h2><p>把围绕同一问题的资料放在一起，为后续比较和写作保留清晰边界。</p><button className="primary-button" onClick={() => setCreating(true)}><Plus size={16} /> 新建专题</button></section> : (
            <div className="topic-grid">
              {topics.map((topic) => {
                const topicSources = sources.filter((source) => source.topicIds.includes(topic.id));
                return <button key={topic.id} className="topic-card" onClick={() => setSelectedTopic(topic)}><span className={`topic-icon ${topic.color}`}><Hash size={20} /></span><h2>{topic.name}</h2><p>{topic.description || "还没有专题说明。"}</p><div className="topic-source-stack">{topicSources.slice(0, 3).map((source) => <span key={source.id}>{source.title.slice(0, 1)}</span>)}<small>{topicSources.length} 份资料</small></div></button>;
              })}
            </div>
          )}
        </div>
      </div>
      {creating && <div className="modal-layer"><button className="modal-backdrop" aria-label="关闭" onClick={() => setCreating(false)} /><form className="modal-panel topic-form" onSubmit={createTopic}><header className="modal-header"><div><h2>新建专题</h2><p>先给研究边界一个清晰名字，资料可以稍后添加。</p></div><button type="button" className="icon-button" onClick={() => setCreating(false)}><X size={18} /></button></header><div className="modal-body"><label className="field-label"><span>专题名称</span><input value={name} onChange={(event) => setName(event.target.value)} placeholder="例如：可解释的检索增强生成" autoFocus /></label><label className="field-label"><span>说明</span><textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder="这个专题试图回答什么问题？" /></label><div className="color-picker"><span>识别色</span><div>{colors.map((item) => <button key={item} type="button" className={`${item} ${color === item ? "active" : ""}`} onClick={() => setColor(item)} aria-label={item}>{color === item && <Check size={13} />}</button>)}</div></div><div className="modal-actions"><button type="button" className="ghost-button" onClick={() => setCreating(false)}>取消</button><button className="primary-button" disabled={!name.trim()}><Save size={15} /> 创建专题</button></div></div></form></div>}
      {selectedTopic && <div className="modal-layer"><button className="modal-backdrop" aria-label="关闭" onClick={() => setSelectedTopic(null)} /><section className="modal-panel topic-detail"><header className="modal-header"><div><span className={`topic-icon ${selectedTopic.color}`}><Hash size={18} /></span><h2>{selectedTopic.name}</h2><p>{selectedTopic.description || "选择要加入这个专题的资料。"}</p></div><button className="icon-button" onClick={() => setSelectedTopic(null)}><X size={18} /></button></header><div className="modal-body"><span className="panel-section-label">资料 · 已选 {selectedSources.length}</span><div className="topic-source-picker">{sources.map((source) => { const checked = source.topicIds.includes(selectedTopic.id); return <button key={source.id} className={checked ? "checked" : ""} onClick={() => void toggleSource(selectedTopic, source.id)}><span className="check-box">{checked && <Check size={13} />}</span><span><strong>{source.title}</strong><small>{clampText(source.summary || source.author || source.type, 80)}</small></span></button>; })}</div>{!sources.length && <p className="panel-empty">资料库里还没有可添加的资料。</p>}<div className="modal-actions"><button className="primary-button" onClick={() => setSelectedTopic(null)}>完成</button></div></div></section></div>}
    </AppShell>
  );
}
