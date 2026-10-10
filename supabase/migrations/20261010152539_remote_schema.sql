SET local check_function_bodies = off;

CREATE TABLE "public"."body_weight_logs" (
  "id"         uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "log_date"   date                     NOT NULL,
  "weight_kg"  numeric                  NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "body_weight_logs_pkey" PRIMARY KEY (id),
  "user_id"    uuid                     NOT NULL DEFAULT auth.uid()
);

ALTER TABLE "public"."body_weight_logs"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."cardio_logs" (
  "session_id"  uuid    NOT NULL,
  "time_min"    numeric,
  "dist_km"     numeric,
  "cal_kcal"    numeric,
  "hr_bpm"      numeric,
  "max_spd_kmh" numeric,
  "avg_spd_kmh" numeric,
  CONSTRAINT "cardio_logs_pkey" PRIMARY KEY (session_id)
);

ALTER TABLE "public"."cardio_logs"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."exercises" (
  "id"         text                     NOT NULL,
  "name"       text                     NOT NULL,
  "category"   text                     NOT NULL,
  "type"       text                     NOT NULL,
  "archived"   boolean                  NOT NULL DEFAULT false,
  "sort_order" integer                  NOT NULL DEFAULT 0,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "exercises_pkey" PRIMARY KEY (id),
  "user_id"    uuid                     NOT NULL DEFAULT auth.uid()
);

ALTER TABLE "public"."exercises"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."meal_logs" (
  "id"         uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "log_date"   date                     NOT NULL,
  "meal_type"  text                     NOT NULL,
  "protein_g"  numeric                  NOT NULL,
  "fat_g"      numeric                  NOT NULL,
  "carb_g"     numeric                  NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "meal_logs_meal_type_check" CHECK ((meal_type = ANY (ARRAY['朝'::text, '昼'::text, '夜'::text, '間食'::text]))),
  CONSTRAINT "meal_logs_pkey" PRIMARY KEY (id),
  "user_id"    uuid                     NOT NULL DEFAULT auth.uid()
);

ALTER TABLE "public"."meal_logs"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."menu_set_items" (
  "menu_set_id" uuid NOT NULL,
  "exercise_id" text NOT NULL,
  CONSTRAINT "menu_set_items_pkey" PRIMARY KEY (menu_set_id, exercise_id)
);

ALTER TABLE "public"."menu_set_items"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."menu_sets" (
  "id"         uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "name"       text                     NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "menu_sets_pkey" PRIMARY KEY (id),
  "user_id"    uuid                     NOT NULL DEFAULT auth.uid()
);

ALTER TABLE "public"."menu_sets"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."sets" (
  "id"         uuid    NOT NULL DEFAULT gen_random_uuid(),
  "session_id" uuid    NOT NULL,
  "set_no"     integer NOT NULL,
  "weight_kg"  numeric NOT NULL,
  "reps"       integer NOT NULL,
  CONSTRAINT "sets_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."sets"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."workout_sessions" (
  "id"           uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "exercise_id"  text                     NOT NULL,
  "session_date" date                     NOT NULL,
  "session_time" text                     NOT NULL DEFAULT '00:00'::text,
  "created_at"   timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "workout_sessions_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."workout_sessions"
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."meal_logs"
  ADD COLUMN "calories_kcal" numeric GENERATED ALWAYS AS ((((protein_g * (4)::numeric) + (fat_g * (9)::numeric)) + (carb_g * (4)::numeric))) STORED;

CREATE OR REPLACE FUNCTION public.get_my_body_weight_logs()
  RETURNS TABLE (
    id         uuid,
    log_date   date,
    weight_kg  numeric,
    created_at timestamp with time zone
  )
  LANGUAGE sql
  AS $function$
  select id, log_date, weight_kg, created_at
  from body_weight_logs
  where user_id = auth.uid()
  order by log_date desc, created_at desc
$function$;

CREATE OR REPLACE FUNCTION public.get_my_exercises()
  RETURNS TABLE (
    id         text,
    name       text,
    category   text,
    type       text,
    archived   boolean,
    sort_order integer
  )
  LANGUAGE sql
  AS $function$
  select id, name, category, type, archived, sort_order
  from exercises
  where user_id = auth.uid()
  order by category, sort_order
$function$;

CREATE OR REPLACE FUNCTION public.get_my_meal_logs()
  RETURNS TABLE (
    id            uuid,
    log_date      date,
    meal_type     text,
    protein_g     numeric,
    fat_g         numeric,
    carb_g        numeric,
    calories_kcal numeric,
    created_at    timestamp with time zone
  )
  LANGUAGE sql
  AS $function$
  select id, log_date, meal_type, protein_g, fat_g, carb_g, calories_kcal, created_at
  from meal_logs
  where user_id = auth.uid()
  order by log_date desc, created_at desc
$function$;

CREATE OR REPLACE FUNCTION public.get_my_sessions_full()
  RETURNS TABLE (
    exercise_id  text,
    session_id   uuid,
    session_date date,
    session_time text,
    sets         jsonb,
    cardio       jsonb
  )
  LANGUAGE sql
  AS $function$
  select
    s.exercise_id, s.id as session_id, s.session_date, s.session_time,
    (select jsonb_agg(jsonb_build_object('id', st.id, 'w', st.weight_kg, 'r', st.reps) order by st.set_no)
       from sets st where st.session_id = s.id) as sets,
    (select jsonb_build_object('time', c.time_min, 'dist', c.dist_km, 'cal', c.cal_kcal,
              'hr', c.hr_bpm, 'maxSpd', c.max_spd_kmh, 'avgSpd', c.avg_spd_kmh)
       from cardio_logs c where c.session_id = s.id) as cardio
  from workout_sessions s
  join exercises e on e.id = s.exercise_id
  where e.user_id = auth.uid()
$function$;

CREATE OR REPLACE FUNCTION public.rls_auto_enable()
  RETURNS event_trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog'
  AS $function$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$function$;

ALTER TABLE "public"."menu_set_items"
  ADD CONSTRAINT "menu_set_items_exercise_id_fkey" FOREIGN KEY (exercise_id) REFERENCES public.exercises(id) ON DELETE CASCADE;

ALTER TABLE "public"."menu_set_items"
  ADD CONSTRAINT "menu_set_items_menu_set_id_fkey" FOREIGN KEY (menu_set_id) REFERENCES public.menu_sets(id) ON DELETE CASCADE;

ALTER TABLE "public"."workout_sessions"
  ADD CONSTRAINT "workout_sessions_exercise_id_fkey" FOREIGN KEY (exercise_id) REFERENCES public.exercises(id) ON DELETE CASCADE;

ALTER TABLE "public"."cardio_logs"
  ADD CONSTRAINT "cardio_logs_session_id_fkey" FOREIGN KEY (session_id) REFERENCES public.workout_sessions(id) ON DELETE CASCADE;

ALTER TABLE "public"."sets"
  ADD CONSTRAINT "sets_session_id_fkey" FOREIGN KEY (session_id) REFERENCES public.workout_sessions(id) ON DELETE CASCADE;

CREATE INDEX sets_session_id_idx ON public.sets USING btree (session_id);

CREATE INDEX workout_sessions_exercise_id_idx ON public.workout_sessions USING btree (exercise_id);

CREATE EVENT TRIGGER "ensure_rls"
  ON ddl_command_end
  WHEN TAG IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
  EXECUTE FUNCTION "public"."rls_auto_enable"();

GRANT EXECUTE ON FUNCTION "public"."get_my_body_weight_logs"() TO PUBLIC, "anon", "authenticated";

REVOKE ALL ON FUNCTION "public"."get_my_body_weight_logs"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."get_my_body_weight_logs"() TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."get_my_body_weight_logs"() TO "service_role";

GRANT EXECUTE ON FUNCTION "public"."get_my_exercises"() TO PUBLIC, "anon", "authenticated";

REVOKE ALL ON FUNCTION "public"."get_my_exercises"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."get_my_exercises"() TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."get_my_exercises"() TO "service_role";

GRANT EXECUTE ON FUNCTION "public"."get_my_meal_logs"() TO PUBLIC, "anon", "authenticated";

REVOKE ALL ON FUNCTION "public"."get_my_meal_logs"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."get_my_meal_logs"() TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."get_my_meal_logs"() TO "service_role";

GRANT EXECUTE ON FUNCTION "public"."get_my_sessions_full"() TO PUBLIC, "anon", "authenticated";

REVOKE ALL ON FUNCTION "public"."get_my_sessions_full"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."get_my_sessions_full"() TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."get_my_sessions_full"() TO "service_role";

GRANT EXECUTE ON FUNCTION "public"."rls_auto_enable"() TO PUBLIC, "anon", "authenticated";

REVOKE ALL ON FUNCTION "public"."rls_auto_enable"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."rls_auto_enable"() TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."rls_auto_enable"() TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."body_weight_logs" TO "anon", "authenticated";

REVOKE ALL ON TABLE "public"."body_weight_logs" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."body_weight_logs" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."body_weight_logs" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."cardio_logs" TO "anon", "authenticated";

REVOKE ALL ON TABLE "public"."cardio_logs" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."cardio_logs" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."cardio_logs" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."exercises" TO "anon", "authenticated";

REVOKE ALL ON TABLE "public"."exercises" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."exercises" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."exercises" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."meal_logs" TO "anon", "authenticated";

REVOKE ALL ON TABLE "public"."meal_logs" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."meal_logs" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."meal_logs" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."menu_set_items" TO "anon", "authenticated";

REVOKE ALL ON TABLE "public"."menu_set_items" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."menu_set_items" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."menu_set_items" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."menu_sets" TO "anon", "authenticated";

REVOKE ALL ON TABLE "public"."menu_sets" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."menu_sets" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."menu_sets" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."sets" TO "anon", "authenticated";

REVOKE ALL ON TABLE "public"."sets" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."sets" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."sets" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."workout_sessions" TO "anon", "authenticated";

REVOKE ALL ON TABLE "public"."workout_sessions" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."workout_sessions" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."workout_sessions" TO "service_role";

ALTER TABLE "public"."body_weight_logs"
  ADD CONSTRAINT "body_weight_logs_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id);

CREATE INDEX body_weight_logs_user_id_log_date_idx ON public.body_weight_logs USING btree (user_id, log_date);

CREATE POLICY "owner only" ON "public"."body_weight_logs"
  FOR ALL
  TO PUBLIC
  USING ((auth.uid() = user_id))
  WITH CHECK ((auth.uid() = user_id));

ALTER TABLE "public"."exercises"
  ADD CONSTRAINT "exercises_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id);

CREATE INDEX exercises_user_id_category_sort_order_idx ON public.exercises USING btree (user_id, category, sort_order);

CREATE POLICY "owner only via session" ON "public"."cardio_logs"
  FOR ALL
  TO PUBLIC
  USING ((EXISTS ( SELECT 1
   FROM (public.workout_sessions s
     JOIN public.exercises e ON ((e.id = s.exercise_id)))
  WHERE ((s.id = cardio_logs.session_id) AND (e.user_id = auth.uid())))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM (public.workout_sessions s
     JOIN public.exercises e ON ((e.id = s.exercise_id)))
  WHERE ((s.id = cardio_logs.session_id) AND (e.user_id = auth.uid())))));

CREATE POLICY "owner only" ON "public"."exercises"
  FOR ALL
  TO PUBLIC
  USING ((auth.uid() = user_id))
  WITH CHECK ((auth.uid() = user_id));

CREATE POLICY "owner only via session" ON "public"."sets"
  FOR ALL
  TO PUBLIC
  USING ((EXISTS ( SELECT 1
   FROM (public.workout_sessions s
     JOIN public.exercises e ON ((e.id = s.exercise_id)))
  WHERE ((s.id = sets.session_id) AND (e.user_id = auth.uid())))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM (public.workout_sessions s
     JOIN public.exercises e ON ((e.id = s.exercise_id)))
  WHERE ((s.id = sets.session_id) AND (e.user_id = auth.uid())))));

CREATE POLICY "owner only via exercise" ON "public"."workout_sessions"
  FOR ALL
  TO PUBLIC
  USING ((EXISTS ( SELECT 1
   FROM public.exercises e
  WHERE ((e.id = workout_sessions.exercise_id) AND (e.user_id = auth.uid())))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM public.exercises e
  WHERE ((e.id = workout_sessions.exercise_id) AND (e.user_id = auth.uid())))));

ALTER TABLE "public"."meal_logs"
  ADD CONSTRAINT "meal_logs_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id);

CREATE INDEX meal_logs_user_id_log_date_idx ON public.meal_logs USING btree (user_id, log_date);

CREATE POLICY "owner only" ON "public"."meal_logs"
  FOR ALL
  TO PUBLIC
  USING ((auth.uid() = user_id))
  WITH CHECK ((auth.uid() = user_id));

ALTER TABLE "public"."menu_sets"
  ADD CONSTRAINT "menu_sets_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id);

CREATE POLICY "owner only via menu_set" ON "public"."menu_set_items"
  FOR ALL
  TO PUBLIC
  USING ((EXISTS ( SELECT 1
   FROM public.menu_sets ms
  WHERE ((ms.id = menu_set_items.menu_set_id) AND (ms.user_id = auth.uid())))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM public.menu_sets ms
  WHERE ((ms.id = menu_set_items.menu_set_id) AND (ms.user_id = auth.uid())))));

CREATE POLICY "owner only" ON "public"."menu_sets"
  FOR ALL
  TO PUBLIC
  USING ((auth.uid() = user_id))
  WITH CHECK ((auth.uid() = user_id));

