'use client';

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { createClient } from '@/utils/supabase/client';
import { TaskComment, TaskAttachment } from '@/lib/types';
import { Spin, Modal, Tooltip } from 'antd';
import {
    SendHorizontal,
    Paperclip,
    Trash2,
    FileText,
    Table2,
    Presentation,
    File,
    ImageIcon,
    X,
    Download,
    MessageSquare,
    Upload,
} from 'lucide-react';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';

dayjs.extend(relativeTime);

// ─── Helpers ─────────────────────────────────────────────────────────────────

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

function formatFileSize(bytes: number | null): string {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function FileIcon({ fileType }: { fileType: string | null }) {
    if (!fileType) return <File className="w-5 h-5 text-slate-400" />;
    if (IMAGE_TYPES.includes(fileType)) return <ImageIcon className="w-5 h-5 text-indigo-500" />;
    if (fileType === 'application/pdf') return <FileText className="w-5 h-5 text-red-500" />;
    if (fileType.includes('sheet') || fileType.includes('excel') || fileType === 'text/csv')
        return <Table2 className="w-5 h-5 text-emerald-500" />;
    if (fileType.includes('presentation') || fileType.includes('powerpoint'))
        return <Presentation className="w-5 h-5 text-orange-500" />;
    if (fileType.includes('word') || fileType.includes('document'))
        return <FileText className="w-5 h-5 text-blue-500" />;
    return <File className="w-5 h-5 text-slate-400" />;
}

// ─── Attachment Preview ───────────────────────────────────────────────────────

function AttachmentChip({
    attachment,
    canDelete,
    onDelete,
}: {
    attachment: TaskAttachment;
    canDelete: boolean;
    onDelete: (a: TaskAttachment) => void;
}) {
    const isImage = IMAGE_TYPES.includes(attachment.file_type || '');

    if (isImage && attachment.public_url) {
        return (
            <div className="relative group inline-block">
                <a href={attachment.public_url} target="_blank" rel="noopener noreferrer">
                    <img
                        src={attachment.public_url}
                        alt={attachment.file_name}
                        className="max-h-48 max-w-xs rounded-xl border border-slate-200 shadow-sm object-cover hover:opacity-90 transition-opacity cursor-pointer"
                    />
                </a>
                {canDelete && (
                    <button
                        onClick={() => onDelete(attachment)}
                        className="absolute top-1.5 right-1.5 bg-slate-800/70 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600"
                        title="Padam lampiran"
                    >
                        <X className="w-3 h-3" />
                    </button>
                )}
            </div>
        );
    }

    return (
        <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 group max-w-xs">
            <FileIcon fileType={attachment.file_type} />
            <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-slate-700 truncate">{attachment.file_name}</p>
                {attachment.file_size && (
                    <p className="text-[10px] text-slate-400">{formatFileSize(attachment.file_size)}</p>
                )}
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
                {attachment.public_url && (
                    <a
                        href={attachment.public_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-slate-400 hover:text-indigo-600 transition-colors"
                        title="Muat turun"
                    >
                        <Download className="w-3.5 h-3.5" />
                    </a>
                )}
                {canDelete && (
                    <button
                        onClick={() => onDelete(attachment)}
                        className="text-slate-300 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
                        title="Padam lampiran"
                    >
                        <Trash2 className="w-3.5 h-3.5" />
                    </button>
                )}
            </div>
        </div>
    );
}

// ─── Pending Upload Chip (before submitting) ──────────────────────────────────

function PendingFileChip({
    file,
    onRemove,
}: {
    file: File;
    onRemove: () => void;
}) {
    const isImage = file.type.startsWith('image/');
    const [preview, setPreview] = useState<string | null>(null);

    useEffect(() => {
        if (isImage) {
            const url = URL.createObjectURL(file);
            setPreview(url);
            return () => URL.revokeObjectURL(url);
        }
    }, [file, isImage]);

    return (
        <div className="relative group inline-flex items-center gap-2 bg-indigo-50 border border-indigo-200 rounded-xl px-3 py-2 max-w-[200px]">
            {isImage && preview ? (
                <img src={preview} alt={file.name} className="w-8 h-8 rounded-lg object-cover flex-shrink-0" />
            ) : (
                <FileIcon fileType={file.type} />
            )}
            <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-indigo-700 truncate">{file.name}</p>
                <p className="text-[10px] text-indigo-400">{formatFileSize(file.size)}</p>
            </div>
            <button
                onClick={onRemove}
                className="text-indigo-300 hover:text-red-500 transition-colors flex-shrink-0"
            >
                <X className="w-3.5 h-3.5" />
            </button>
        </div>
    );
}

// ─── Single Comment Bubble ────────────────────────────────────────────────────

function CommentBubble({
    comment,
    currentUserId,
    isAdmin,
    onDelete,
    onDeleteAttachment,
}: {
    comment: TaskComment;
    currentUserId: string;
    isAdmin: boolean;
    onDelete: (c: TaskComment) => void;
    onDeleteAttachment: (a: TaskAttachment) => void;
}) {
    const isOwn = comment.user_id === currentUserId;
    const canDelete = isOwn || isAdmin;
    const avatarUrl =
        comment.user?.avatar_url ||
        `https://ui-avatars.com/api/?name=${encodeURIComponent(comment.user?.full_name || 'U')}&background=6366f1&color=fff&size=64`;

    return (
        <div className={`flex gap-3 group ${isOwn ? 'flex-row-reverse' : ''}`}>
            {/* Avatar */}
            <img
                src={avatarUrl}
                alt={comment.user?.full_name || 'User'}
                className="w-8 h-8 rounded-full flex-shrink-0 border-2 border-white shadow-sm mt-0.5"
            />

            {/* Bubble */}
            <div className={`flex flex-col gap-2 max-w-[80%] ${isOwn ? 'items-end' : 'items-start'}`}>
                {/* Name + time */}
                <div className={`flex items-center gap-2 ${isOwn ? 'flex-row-reverse' : ''}`}>
                    <span className="text-xs font-bold text-slate-700">
                        {isOwn ? 'Saya' : comment.user?.full_name || 'Unknown'}
                    </span>
                    <Tooltip title={dayjs(comment.created_at).format('DD MMM YYYY, HH:mm')}>
                        <span className="text-[10px] text-slate-400 cursor-default">
                            {dayjs(comment.created_at).fromNow()}
                        </span>
                    </Tooltip>
                    {canDelete && (
                        <button
                            onClick={() => onDelete(comment)}
                            className="text-slate-300 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
                            title="Padam komen"
                        >
                            <Trash2 className="w-3 h-3" />
                        </button>
                    )}
                </div>

                {/* Content */}
                {comment.content && (
                    <div
                        className={`px-4 py-2.5 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap break-words ${
                            isOwn
                                ? 'bg-indigo-600 text-white rounded-tr-sm'
                                : 'bg-white border border-slate-200 text-slate-700 rounded-tl-sm shadow-sm'
                        }`}
                    >
                        {comment.content}
                    </div>
                )}

                {/* Attachments */}
                {comment.attachments && comment.attachments.length > 0 && (
                    <div className={`flex flex-wrap gap-2 ${isOwn ? 'justify-end' : 'justify-start'}`}>
                        {comment.attachments.map((att) => (
                            <AttachmentChip
                                key={att.id}
                                attachment={att}
                                canDelete={canDelete}
                                onDelete={onDeleteAttachment}
                            />
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}

// ─── Main Component ───────────────────────────────────────────────────────────

interface TaskCommentsProps {
    taskId: string;
    currentUserId: string;
    role?: string | null;
}

export default function TaskComments({ taskId, currentUserId, role }: TaskCommentsProps) {
    const [comments, setComments] = useState<TaskComment[]>([]);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [content, setContent] = useState('');
    const [pendingFiles, setPendingFiles] = useState<File[]>([]);
    const [isDragging, setIsDragging] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const feedEndRef = useRef<HTMLDivElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    const supabase = createClient();
    const isAdmin = role === 'admin' || role === 'manager';

    // ── Fetch Comments ────────────────────────────────────────────────────────

    const fetchComments = useCallback(async () => {
        const { data, error } = await supabase
            .from('tsk_comments')
            .select(`
                *,
                user:lv_profiles!tsk_comments_user_id_fkey(id, full_name, avatar_url),
                attachments:tsk_attachments(*)
            `)
            .eq('task_id', taskId)
            .order('created_at', { ascending: true });

        if (!error && data) {
            setComments(data as TaskComment[]);
        }
        setLoading(false);
    }, [taskId]);

    useEffect(() => {
        fetchComments();

        // Realtime subscription
        const channel = supabase
            .channel(`task-comments-${taskId}`)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'tsk_comments', filter: `task_id=eq.${taskId}` }, fetchComments)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'tsk_attachments', filter: `task_id=eq.${taskId}` }, fetchComments)
            .subscribe();

        return () => { supabase.removeChannel(channel); };
    }, [taskId, fetchComments]);

    // Auto-scroll to bottom on new comments
    useEffect(() => {
        feedEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [comments]);

    // ── File Handling ─────────────────────────────────────────────────────────

    const addFiles = (files: FileList | null) => {
        if (!files) return;
        const valid: File[] = [];
        Array.from(files).forEach((f) => {
            if (f.size > MAX_FILE_SIZE) {
                Modal.warning({ title: 'Fail terlalu besar', content: `"${f.name}" melebihi had 10MB.`, centered: true });
                return;
            }
            valid.push(f);
        });
        setPendingFiles((prev) => [...prev, ...valid]);
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
        addFiles(e.dataTransfer.files);
    };

    // ── Upload files to Supabase Storage ─────────────────────────────────────

    const uploadFiles = async (commentId: string, files: File[]): Promise<void> => {
        for (const file of files) {
            const ext = file.name.split('.').pop();
            const uniqueName = `${taskId}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;

            const { data: uploadData, error: uploadError } = await supabase.storage
                .from('tsk-attachments')
                .upload(uniqueName, file, { contentType: file.type, upsert: false });

            if (uploadError) {
                console.error('Upload error:', uploadError.message);
                continue;
            }

            const { data: publicUrlData } = supabase.storage
                .from('tsk-attachments')
                .getPublicUrl(uniqueName);

            await supabase.from('tsk_attachments').insert({
                task_id: taskId,
                comment_id: commentId,
                user_id: currentUserId,
                file_name: file.name,
                file_size: file.size,
                file_type: file.type,
                storage_path: uniqueName,
                public_url: publicUrlData?.publicUrl || null,
            });
        }
    };

    // ── Submit Comment ────────────────────────────────────────────────────────

    const handleSubmit = async () => {
        if (!content.trim() && pendingFiles.length === 0) return;
        setSubmitting(true);
        try {
            const { data: commentData, error } = await supabase
                .from('tsk_comments')
                .insert({ task_id: taskId, user_id: currentUserId, content: content.trim() })
                .select()
                .single();

            if (error) throw error;

            if (pendingFiles.length > 0) {
                await uploadFiles(commentData.id, pendingFiles);
            }

            setContent('');
            setPendingFiles([]);
            await fetchComments();
        } catch (err: any) {
            console.error('Error posting comment:', err.message);
            Modal.error({ title: 'Ralat', content: 'Gagal menghantar komen. Sila cuba lagi.', centered: true });
        } finally {
            setSubmitting(false);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSubmit();
        }
    };

    // ── Delete Comment ────────────────────────────────────────────────────────

    const handleDeleteComment = (comment: TaskComment) => {
        Modal.confirm({
            title: 'Padam Komen?',
            content: 'Tindakan ini tidak boleh dibatalkan. Semua lampiran dalam komen ini juga akan dipadam.',
            okText: 'Ya, Padam',
            okType: 'danger',
            cancelText: 'Batal',
            centered: true,
            onOk: async () => {
                // Delete attachments from storage first
                if (comment.attachments && comment.attachments.length > 0) {
                    const paths = comment.attachments.map((a) => a.storage_path);
                    await supabase.storage.from('tsk-attachments').remove(paths);
                    await supabase.from('tsk_attachments').delete().eq('comment_id', comment.id);
                }
                await supabase.from('tsk_comments').delete().eq('id', comment.id);
                await fetchComments();
            },
        });
    };

    // ── Delete Attachment ─────────────────────────────────────────────────────

    const handleDeleteAttachment = (attachment: TaskAttachment) => {
        Modal.confirm({
            title: 'Padam Lampiran?',
            content: `"${attachment.file_name}" akan dipadam secara kekal.`,
            okText: 'Ya, Padam',
            okType: 'danger',
            cancelText: 'Batal',
            centered: true,
            onOk: async () => {
                await supabase.storage.from('tsk-attachments').remove([attachment.storage_path]);
                await supabase.from('tsk_attachments').delete().eq('id', attachment.id);
                await fetchComments();
            },
        });
    };

    // ── Render ────────────────────────────────────────────────────────────────

    return (
        <div
            className="flex flex-col h-full"
            style={{ maxHeight: '770px' }}
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
        >
            {/* Header */}
            <div className="flex items-center gap-2 pb-3 mb-3 border-b border-slate-100 flex-shrink-0">
                <div className="w-7 h-7 rounded-lg bg-indigo-100 flex items-center justify-center">
                    <MessageSquare className="w-4 h-4 text-indigo-600" />
                </div>
                <div>
                    <h3 className="text-sm font-bold text-slate-800 leading-none">Komen & Lampiran</h3>
                    <p className="text-[10px] text-slate-400 mt-0.5">{comments.length} komen · Realtime</p>
                </div>
            </div>

            {/* Drag Overlay */}
            {isDragging && (
                <div className="absolute inset-0 z-50 bg-indigo-50/90 border-2 border-dashed border-indigo-400 rounded-2xl flex flex-col items-center justify-center gap-3 pointer-events-none">
                    <Upload className="w-10 h-10 text-indigo-500" />
                    <p className="text-indigo-700 font-bold text-sm">Lepaskan fail di sini</p>
                </div>
            )}

            {/* Comment Feed */}
            <div className="flex-1 overflow-y-auto flex flex-col gap-4 pr-1 pb-2">
                {loading ? (
                    <div className="flex justify-center items-center h-32">
                        <Spin size="small" />
                    </div>
                ) : comments.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-32 gap-3 text-slate-400">
                        <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center">
                            <MessageSquare className="w-6 h-6 text-slate-300" />
                        </div>
                        <div className="text-center">
                            <p className="text-sm font-semibold text-slate-500">Tiada komen lagi</p>
                            <p className="text-xs text-slate-400 mt-0.5">Mulakan perbincangan di bawah</p>
                        </div>
                    </div>
                ) : (
                    comments.map((comment) => (
                        <CommentBubble
                            key={comment.id}
                            comment={comment}
                            currentUserId={currentUserId}
                            isAdmin={isAdmin}
                            onDelete={handleDeleteComment}
                            onDeleteAttachment={handleDeleteAttachment}
                        />
                    ))
                )}
                <div ref={feedEndRef} />
            </div>

            {/* Pending Files Preview */}
            {pendingFiles.length > 0 && (
                <div className="flex flex-wrap gap-2 pt-3 pb-2 border-t border-slate-100 flex-shrink-0">
                    {pendingFiles.map((f, idx) => (
                        <PendingFileChip
                            key={idx}
                            file={f}
                            onRemove={() => setPendingFiles((prev) => prev.filter((_, i) => i !== idx))}
                        />
                    ))}
                </div>
            )}

            {/* Compose Box */}
            <div className="flex-shrink-0 pt-3 border-t border-slate-100">
                <div className={`flex items-end gap-2 bg-slate-50 border rounded-2xl px-3 py-2 transition-all ${
                    isDragging ? 'border-indigo-400 bg-indigo-50' : 'border-slate-200 focus-within:border-indigo-300 focus-within:bg-white'
                }`}>
                    {/* File attach button */}
                    <Tooltip title="Lampirkan fail (Max 10MB)">
                        <button
                            onClick={() => fileInputRef.current?.click()}
                            className="flex-shrink-0 p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors mb-0.5"
                        >
                            <Paperclip className="w-4 h-4" />
                        </button>
                    </Tooltip>
                    <input
                        ref={fileInputRef}
                        type="file"
                        multiple
                        className="hidden"
                        accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip,.mp4"
                        onChange={(e) => addFiles(e.target.files)}
                    />

                    {/* Textarea */}
                    <textarea
                        ref={textareaRef}
                        value={content}
                        onChange={(e) => setContent(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="Tulis komen... (Enter = hantar, Shift+Enter = baris baru)"
                        rows={1}
                        style={{ resize: 'none' }}
                        className="flex-1 bg-transparent text-sm text-slate-700 placeholder-slate-400 outline-none py-1.5 max-h-32 overflow-y-auto leading-relaxed"
                        onInput={(e) => {
                            const t = e.currentTarget;
                            t.style.height = 'auto';
                            t.style.height = Math.min(t.scrollHeight, 128) + 'px';
                        }}
                    />

                    {/* Send button */}
                    <button
                        onClick={handleSubmit}
                        disabled={submitting || (!content.trim() && pendingFiles.length === 0)}
                        className={`flex-shrink-0 p-2 rounded-xl transition-all mb-0.5 ${
                            content.trim() || pendingFiles.length > 0
                                ? 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm hover:shadow-md'
                                : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                        }`}
                    >
                        {submitting ? (
                            <Spin size="small" />
                        ) : (
                            <SendHorizontal className="w-4 h-4" />
                        )}
                    </button>
                </div>
                <p className="text-[10px] text-slate-400 mt-1.5 text-center">
                    Seret & lepas fail ke mana-mana sahaja dalam panel ini untuk memuat naik
                </p>
            </div>
        </div>
    );
}
