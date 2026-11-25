const labels = {
  web_search: 'Search the web', calculator: 'Calculator', gmail_read: 'Search email', gmail_get_email_details: 'Read email bodies', gmail_send: 'Send email', calendar_list_events: 'Read calendar', calendar_create_event: 'Create events', calendar_delete_event: 'Delete events', instagram_get_profile: 'Read Instagram profile', instagram_get_recent_posts: 'Read Instagram posts', instagram_publish_photo: 'Publish Instagram photos',
};
export default function ToolPermissions({ value, onChange, disabled = false }) {
  return <fieldset disabled={disabled} className="flex flex-wrap gap-3">
    <legend className="mb-3 text-sm text-zinc-300">Allowed tools</legend>
    {Object.entries(labels).map(([tool, label]) => <label key={tool} className="flex items-center gap-2 text-xs text-zinc-300">
      <input type="checkbox" checked={value.includes(tool)} onChange={event => onChange(event.target.checked ? [...value, tool] : value.filter(name => name !== tool))} />{label}
    </label>)}
  </fieldset>;
}
