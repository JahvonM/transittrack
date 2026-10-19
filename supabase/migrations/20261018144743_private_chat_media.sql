-- Chat attachments include voice notes and short videos, so the private
-- storage area takes those too. Safe to run twice.
update storage.buckets
   set allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/heic', 'application/pdf',
                                  'audio/webm', 'video/webm', 'audio/mp4', 'video/mp4', 'audio/mpeg', 'audio/ogg']
 where id = 'private';
