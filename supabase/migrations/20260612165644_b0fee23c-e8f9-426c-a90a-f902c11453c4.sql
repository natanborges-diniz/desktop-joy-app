
CREATE POLICY "anexos auth read" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id IN ('mensagens-anexos','solicitacao-anexos'));

CREATE POLICY "anexos auth insert" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id IN ('mensagens-anexos','solicitacao-anexos'));

CREATE POLICY "anexos auth update" ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id IN ('mensagens-anexos','solicitacao-anexos'));

CREATE POLICY "anexos auth delete" ON storage.objects FOR DELETE TO authenticated
USING (bucket_id IN ('mensagens-anexos','solicitacao-anexos'));
