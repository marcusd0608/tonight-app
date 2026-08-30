'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { createClient } from '@/utils/supabase/client'

type Post = { id: string; userId: string; displayName: string; profilePhotoUrl: string | null; eventName: string; description: string | null; vibeTags: string[]; photoUrl: string | null; createdAt: string }
type Connection = { requester_id: string; recipient_id: string; status: string }
type Comment = { id: string; post_id: string; user_id: string; parent_comment_id: string | null; body: string; created_at: string; displayName: string }

export default function PostsPage() {
  const [userId, setUserId] = useState('')
  const [posts, setPosts] = useState<Post[]>([])
  const [connections, setConnections] = useState<Connection[]>([])
  const [likes, setLikes] = useState<string[]>([])
  const [likeCounts, setLikeCounts] = useState<Record<string, number>>({})
  const [comments, setComments] = useState<Record<string, Comment[]>>({})
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({})
  const [openComments, setOpenComments] = useState<Record<string, boolean>>({})
  const [deletingCommentId, setDeletingCommentId] = useState('')
  const [replyingTo, setReplyingTo] = useState<string | null>(null)
  const [openMenuPostId, setOpenMenuPostId] = useState('')
  const [loading, setLoading] = useState(true)
  const [deletingId, setDeletingId] = useState('')
  const [message, setMessage] = useState('')

  const loadPosts = async () => {
    const supabase = createClient()
    const { data: authData } = await supabase.auth.getUser()
    if (!authData.user) { setLoading(false); return }
    setUserId(authData.user.id)

    const { data: blocks } = await supabase.from('blocks').select('blocker_id, blocked_id').or(`blocker_id.eq.${authData.user.id},blocked_id.eq.${authData.user.id}`)
    const blockedIds = (blocks ?? []).map((block) => block.blocker_id === authData.user.id ? block.blocked_id : block.blocker_id)
    const [{ data, error }, { data: connectionRows }, { data: likeRows }, { data: commentRows }] = await Promise.all([
      supabase.from('posts').select('id, user_id, event_id, description, vibe_tags, photo_url, created_at').order('created_at', { ascending: false }),
      supabase.from('connections').select('requester_id, recipient_id, status').or(`requester_id.eq.${authData.user.id},recipient_id.eq.${authData.user.id}`),
      supabase.from('post_likes').select('post_id, user_id'),
      supabase.from('post_comments').select('id, post_id, user_id, parent_comment_id, body, created_at').order('created_at', { ascending: true })
    ])
    if (error) { setMessage(error.message); setLoading(false); return }
    setConnections(connectionRows ?? [])
    const visiblePosts = (data ?? []).filter((post) => !blockedIds.includes(post.user_id))
    const eventIds = visiblePosts.map((post) => post.event_id)
    const postUserIds = visiblePosts.map((post) => post.user_id)
    const commentUserIds = (commentRows ?? []).map((comment) => comment.user_id)
    const [{ data: events }, { data: profiles }] = await Promise.all([
      eventIds.length ? supabase.from('events').select('id, name').in('id', eventIds) : Promise.resolve({ data: [] as { id: string; name: string }[] }),
      [...new Set([...postUserIds, ...commentUserIds])].length ? supabase.from('profiles').select('id, display_name, photo_url').in('id', [...new Set([...postUserIds, ...commentUserIds])]) : Promise.resolve({ data: [] as { id: string; display_name: string | null; photo_url: string | null }[] })
    ])
    const eventNames = new Map((events ?? []).map((event) => [event.id, event.name]))
    const profileData = new Map((profiles ?? []).map((profile) => [profile.id, profile]))
    setPosts(visiblePosts.map((post) => ({ id: post.id, userId: post.user_id, displayName: profileData.get(post.user_id)?.display_name ?? 'Tonight user', profilePhotoUrl: profileData.get(post.user_id)?.photo_url ?? null, eventName: eventNames.get(post.event_id) ?? 'Unnamed event', description: post.description ?? null, vibeTags: Array.isArray(post.vibe_tags) ? post.vibe_tags : [], photoUrl: post.photo_url, createdAt: post.created_at })))
    setLikes((likeRows ?? []).filter((like) => like.user_id === authData.user.id).map((like) => like.post_id))
    setLikeCounts((likeRows ?? []).reduce<Record<string, number>>((counts, like) => ({ ...counts, [like.post_id]: (counts[like.post_id] ?? 0) + 1 }), {}))
    setComments((commentRows ?? []).reduce<Record<string, Comment[]>>((grouped, comment) => ({ ...grouped, [comment.post_id]: [...(grouped[comment.post_id] ?? []), { ...comment, displayName: profileData.get(comment.user_id)?.display_name ?? 'Tonight user' }] }), {}))
    setLoading(false)
  }

  useEffect(() => { queueMicrotask(() => { void loadPosts() }) }, [])

  const connectionFor = (otherUserId: string) => connections.find((connection) => (connection.requester_id === userId && connection.recipient_id === otherUserId) || (connection.recipient_id === userId && connection.requester_id === otherUserId))
  const connectWith = async (recipientId: string) => { const { error } = await createClient().from('connections').insert({ requester_id: userId, recipient_id: recipientId, status: 'pending' }); if (error) setMessage(error.message); else setConnections((current) => [...current, { requester_id: userId, recipient_id: recipientId, status: 'pending' }]) }
  const deletePost = async (postId: string) => { if (!window.confirm('Delete this post?')) return; setDeletingId(postId); const { error } = await createClient().from('posts').delete().eq('id', postId); if (error) setMessage(error.message); else setPosts((current) => current.filter((post) => post.id !== postId)); setDeletingId('') }
  const blockUser = async (blockedId: string) => { if (!window.confirm('Block this user? Their posts will disappear from your feeds.')) return; const { error } = await createClient().from('blocks').insert({ blocker_id: userId, blocked_id: blockedId }); if (error) setMessage(error.message); else setPosts((current) => current.filter((post) => post.userId !== blockedId)) }
  const reportPost = async (post: Post) => { const reason = window.prompt('Why are you reporting this post?'); if (!reason?.trim()) return; const { error } = await createClient().from('reports').insert({ reporter_id: userId, reported_user_id: post.userId, post_id: post.id, reason: reason.trim() }); setMessage(error ? error.message : 'Report submitted for review.') }

  const toggleLike = async (postId: string) => {
    const supabase = createClient()
    const liked = likes.includes(postId)
    const result = liked ? await supabase.from('post_likes').delete().eq('post_id', postId).eq('user_id', userId) : await supabase.from('post_likes').insert({ post_id: postId, user_id: userId })
    if (result.error) setMessage(result.error.message)
    else { setLikes((current) => liked ? current.filter((id) => id !== postId) : [...current, postId]); setLikeCounts((current) => ({ ...current, [postId]: Math.max(0, (current[postId] ?? 0) + (liked ? -1 : 1)) })) }
  }

  const addComment = async (postId: string, parentCommentId: string | null = null) => {
    const body = commentDrafts[postId]?.trim()
    if (!body) return
    const { data, error } = await createClient().from('post_comments').insert({ post_id: postId, user_id: userId, parent_comment_id: parentCommentId, body }).select('id, post_id, user_id, parent_comment_id, body, created_at').single()
    if (error || !data) { setMessage(error?.message ?? 'Could not add comment.'); return }
    setComments((current) => ({ ...current, [postId]: [...(current[postId] ?? []), { ...data, displayName: 'You' }] }))
    setCommentDrafts((current) => ({ ...current, [postId]: '' }))
    setReplyingTo(null)
  }

  const deleteComment = async (comment: Comment) => {
    if (!window.confirm('Delete this comment?')) return
    setDeletingCommentId(comment.id)
    const { error } = await createClient().from('post_comments').delete().eq('id', comment.id).eq('user_id', userId)
    if (error) setMessage(error.message)
    else setComments((current) => ({ ...current, [comment.post_id]: (current[comment.post_id] ?? []).filter((item) => item.id !== comment.id) }))
    setDeletingCommentId('')
  }

  return <main style={{ padding: '1.5rem', maxWidth: '600px', margin: '0 auto' }}>
    <h1 style={{ margin: '0 0 1.5rem' }}>Posts</h1>
    {message ? <p role="status" style={{ padding: '0.75rem', borderRadius: '8px', background: '#f1f5f9' }}>{message}</p> : null}
    {loading ? <p>Loading posts...</p> : posts.length === 0 ? <p style={{ color: '#64748b' }}>No posts yet. Be the first to share a night.</p> : <div style={{ display: 'grid', gap: '1.25rem' }}>{posts.map((post) => {
      const connection = connectionFor(post.userId)
      const postComments = comments[post.id] ?? []
      const isOwnPost = post.userId === userId
      return <article key={post.id} style={{ overflow: 'hidden', border: '1px solid #dbdbdb', borderRadius: '10px', background: '#fff' }}>
        <header style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', padding: '0.75rem' }}>
          <Link href={`/profile/${post.userId}`} aria-label={`View ${post.displayName}'s profile`} style={{ width: '38px', height: '38px', borderRadius: '50%', overflow: 'hidden', background: '#e2e8f0', flexShrink: 0 }}>
            {post.profilePhotoUrl ? <img src={post.profilePhotoUrl} alt="" style={{ display: 'block', width: '100%', height: '100%', objectFit: 'cover' }} /> : null}
          </Link>
          <div style={{ flex: 1, minWidth: 0 }}><Link href={`/profile/${post.userId}`} style={{ color: '#111827', fontSize: '0.9rem', fontWeight: 700, textDecoration: 'none' }}>{post.displayName}</Link><p style={{ margin: '0.15rem 0 0', color: '#64748b', fontSize: '0.72rem' }}>{new Date(post.createdAt).toLocaleString()}</p></div>
          {!isOwnPost ? <button type="button" onClick={() => connectWith(post.userId)} disabled={Boolean(connection)} style={{ padding: '0.35rem 0.65rem', border: '1px solid #2563eb', borderRadius: '7px', background: connection ? '#dbeafe' : '#2563eb', color: connection ? '#1d4ed8' : '#fff', fontWeight: 700 }}>{connection ? connection.status === 'accepted' ? 'Connected' : 'Requested' : 'Connect'}</button> : null}
          <div style={{ position: 'relative' }}>
            <button type="button" aria-label="Post options" title="Post options" onClick={() => setOpenMenuPostId((current) => current === post.id ? '' : post.id)} style={{ border: 0, background: 'transparent', fontSize: '1.35rem', lineHeight: 1, cursor: 'pointer', padding: '0 0.2rem' }}>...</button>
            {openMenuPostId === post.id ? <div style={{ position: 'absolute', right: 0, top: '2rem', zIndex: 5, minWidth: '130px', padding: '0.35rem', border: '1px solid #e5e7eb', borderRadius: '8px', background: '#fff', boxShadow: '0 8px 20px rgba(15,23,42,0.15)' }}>{isOwnPost ? <button type="button" disabled={deletingId === post.id} onClick={() => { setOpenMenuPostId(''); void deletePost(post.id) }} style={{ width: '100%', padding: '0.55rem', border: 0, background: '#fff', color: '#b91c1c', textAlign: 'left', cursor: deletingId === post.id ? 'not-allowed' : 'pointer', fontWeight: 700 }}>{deletingId === post.id ? 'Deleting...' : 'Delete post'}</button> : <><button type="button" onClick={() => { setOpenMenuPostId(''); void blockUser(post.userId) }} style={{ width: '100%', padding: '0.55rem', border: 0, background: '#fff', color: '#334155', textAlign: 'left', cursor: 'pointer', fontWeight: 700 }}>Block user</button><button type="button" onClick={() => { setOpenMenuPostId(''); void reportPost(post) }} style={{ width: '100%', padding: '0.55rem', border: 0, background: '#fff', color: '#b91c1c', textAlign: 'left', cursor: 'pointer', fontWeight: 700 }}>Report post</button></>}</div> : null}
          </div>
        </header>
        {post.photoUrl ? <div style={{ width: '100%', aspectRatio: '1', background: '#f1f5f9', overflow: 'hidden' }}><img src={post.photoUrl} alt={`${post.eventName} post`} style={{ display: 'block', width: '100%', height: '100%', objectFit: 'contain' }} /></div> : null}
        <div style={{ padding: '0.75rem' }}>
          <div style={{ display: 'flex', gap: '0.9rem', alignItems: 'center' }}><button type="button" aria-label={likes.includes(post.id) ? 'Unlike post' : 'Like post'} onClick={() => toggleLike(post.id)} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', border: 0, background: 'transparent', padding: 0, color: likes.includes(post.id) ? '#dc2626' : '#111827', fontSize: '1.25rem', cursor: 'pointer' }}>{likes.includes(post.id) ? '♥' : '♡'}<span style={{ fontSize: '0.82rem', color: '#334155' }}>{likeCounts[post.id] ?? 0}</span></button><button type="button" aria-label="Show comments" onClick={() => setOpenComments((current) => ({ ...current, [post.id]: !current[post.id] }))} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', border: 0, background: 'transparent', padding: 0, color: '#111827', fontSize: '1.05rem', cursor: 'pointer' }}>&#128172;<span style={{ fontSize: '0.82rem', color: '#334155' }}>{postComments.length}</span></button></div>
          <h2 style={{ margin: '0.45rem 0 0.2rem', fontSize: '1rem' }}>{post.eventName}</h2>
          {post.description ? <p style={{ margin: '0 0 0.4rem', color: '#334155', fontSize: '0.88rem', whiteSpace: 'pre-wrap' }}>{post.description}</p> : null}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>{post.vibeTags.map((tag) => <span key={tag} style={{ color: '#475569', fontSize: '0.78rem' }}>#{tag.replace(/\s+/g, '')}</span>)}</div>
          {openComments[post.id] ? <div style={{ marginTop: '0.75rem', paddingTop: '0.65rem', borderTop: '1px solid #e5e7eb' }}>{postComments.map((comment) => <div key={comment.id} style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', marginBottom: '0.45rem', marginLeft: comment.parent_comment_id ? '1.25rem' : 0, fontSize: '0.85rem' }}><div><p style={{ margin: 0 }}><strong>{comment.displayName}</strong> {comment.body}</p><button type="button" onClick={() => setReplyingTo(comment.id)} style={{ border: 0, background: 'transparent', color: '#64748b', cursor: 'pointer', padding: 0, marginTop: '0.2rem', fontSize: '0.72rem' }}>Reply</button></div>{comment.user_id === userId ? <button type="button" aria-label="Delete comment" title="Delete comment" onClick={() => deleteComment(comment)} disabled={deletingCommentId === comment.id} style={{ border: 0, background: 'transparent', color: '#b91c1c', cursor: deletingCommentId === comment.id ? 'not-allowed' : 'pointer', fontSize: '1rem', padding: 0 }}>&#128465;</button> : null}</div>)}<div style={{ display: 'flex', gap: '0.5rem' }}><input value={commentDrafts[post.id] ?? ''} maxLength={500} onChange={(event) => setCommentDrafts((current) => ({ ...current, [post.id]: event.target.value }))} placeholder={replyingTo ? 'Write a reply...' : 'Add a comment...'} style={{ flex: 1, minWidth: 0, padding: '0.6rem', border: '1px solid #cbd5e1', borderRadius: '8px' }} /><button type="button" onClick={() => addComment(post.id, replyingTo)} style={{ padding: '0.6rem 0.8rem', border: 0, background: '#111827', color: '#fff', borderRadius: '8px', fontWeight: 700 }}>Post</button>{replyingTo ? <button type="button" onClick={() => setReplyingTo(null)} style={{ padding: '0.6rem', border: 0, background: 'transparent', color: '#64748b' }}>Cancel</button> : null}</div></div> : null}
        </div>
      </article>
    })}</div>}
  </main>
}
