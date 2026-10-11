create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_settings (
  user_id uuid primary key references auth.users (id) on delete cascade,
  assistant_name text not null default 'ULTRON'
    check (char_length(assistant_name) between 1 and 40),
  preferred_voice text not null default '',
  speech_rate numeric(3, 2) not null default 1.00
    check (speech_rate between 0.70 and 1.30),
  speech_pitch numeric(3, 2) not null default 1.00
    check (speech_pitch between 0.50 and 1.50),
  personality_intensity smallint not null default 65
    check (personality_intensity between 0 and 100),
  humour_level smallint not null default 35
    check (humour_level between 0 and 100),
  personality_mode text not null default 'calm'
    check (personality_mode in ('calm', 'witty', 'precise')),
  wake_phrase text not null default 'Hey ULTRON'
    check (char_length(wake_phrase) between 1 and 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null default 'New conversation'
    check (char_length(title) between 1 and 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id)
);

create index if not exists conversations_user_updated_idx
  on public.conversations (user_id, updated_at desc);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null check (char_length(content) between 1 and 10000),
  created_at timestamptz not null default now(),
  constraint messages_conversation_owner_fk
    foreign key (conversation_id, user_id)
    references public.conversations (id, user_id)
    on delete cascade
);

create index if not exists messages_conversation_created_idx
  on public.messages (conversation_id, created_at);

create table if not exists public.notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 160),
  content text not null check (char_length(content) between 1 and 10000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists notes_user_updated_idx
  on public.notes (user_id, updated_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

create trigger user_settings_set_updated_at
before update on public.user_settings
for each row execute function public.set_updated_at();

create trigger conversations_set_updated_at
before update on public.conversations
for each row execute function public.set_updated_at();

create trigger notes_set_updated_at
before update on public.notes
for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', ''))
  on conflict (id) do nothing;

  insert into public.user_settings (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.user_settings enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.notes enable row level security;

create policy "Users can read their own profile"
  on public.profiles for select to authenticated
  using (auth.uid() = id);
create policy "Users can update their own profile"
  on public.profiles for update to authenticated
  using (auth.uid() = id) with check (auth.uid() = id);

create policy "Users can manage their own settings"
  on public.user_settings for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "Users can manage their own conversations"
  on public.conversations for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "Users can manage messages in their own conversations"
  on public.messages for all to authenticated
  using (
    auth.uid() = user_id
    and exists (
      select 1 from public.conversations c
      where c.id = conversation_id and c.user_id = auth.uid()
    )
  )
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.conversations c
      where c.id = conversation_id and c.user_id = auth.uid()
    )
  );

create policy "Users can manage their own notes"
  on public.notes for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

revoke all on public.profiles, public.user_settings, public.conversations,
  public.messages, public.notes from anon;
grant select, insert, update, delete on public.profiles, public.user_settings,
  public.conversations, public.messages, public.notes to authenticated;
