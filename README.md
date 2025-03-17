# Threads for GitHub

**Goal**: To build a bridge between GitHub and X by finding the threads and repos that are related to each other.

**Definition**: Scrapes all X links from a Github Repo.

The api https://threads.forgithub.com/[owner]/[repo][/tree/[branch]/[...path]] simply performs a regex search for https://x|twitter.com/(.+)/status/(0-9+) and returns the posts as a `{id:number,login:string, url:string }[]`

Now the only additional requirement when you wish to share a project would be to ensure you add the posts in your changelog or elsewhere. It'd find it easily. To make linking, we can use xymakes X post history of the owner to automatically share threads that have the Github URL in them. This would be a secondary way of finding threads for a repo even if they weren't linked in the repo itself, it may be linked in X thread history.

## CHANGELOG (2025-03-18)

1. ✅ Add regex file content search to zipobject and ensure the matches end up in each file
2. ✅ Implement the first part
3. ✅ Build serper wrapper with strong caching (24h?)
4. ✅ Implement the second part

## WISHLIST

- Finish xymake to get the X post history (and add search into the db) to be a more reliable X data source than Google
