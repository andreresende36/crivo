-- Migration 015: Cria bucket de Storage para imagens aprimoradas
-- Bucket público "images" — leitura pública, escrita apenas pelo service_role

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'images',
    'images',
    true,
    5242880,  -- 5 MB por arquivo
    ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO UPDATE
    SET public             = EXCLUDED.public,
        file_size_limit    = EXCLUDED.file_size_limit,
        allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Política: leitura pública irrestrita
CREATE POLICY "images_public_read"
    ON storage.objects FOR SELECT
    USING (bucket_id = 'images');

-- Política: inserção apenas pelo service_role (worker backend)
CREATE POLICY "images_service_insert"
    ON storage.objects FOR INSERT
    WITH CHECK (
        bucket_id = 'images'
        AND (auth.role() = 'service_role' OR auth.role() = 'authenticated')
    );

-- Política: atualização (upsert) apenas pelo service_role
CREATE POLICY "images_service_update"
    ON storage.objects FOR UPDATE
    USING (
        bucket_id = 'images'
        AND (auth.role() = 'service_role' OR auth.role() = 'authenticated')
    )
    WITH CHECK (
        bucket_id = 'images'
        AND (auth.role() = 'service_role' OR auth.role() = 'authenticated')
    );

-- Política: deleção apenas pelo service_role
CREATE POLICY "images_service_delete"
    ON storage.objects FOR DELETE
    USING (
        bucket_id = 'images'
        AND auth.role() = 'service_role'
    );
