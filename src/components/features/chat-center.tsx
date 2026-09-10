'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { apiGet, apiPost } from '@/lib/api-client'
import { toast } from 'sonner'
import { MessageCircle, Search, MapPin, Send, ChevronLeft, ImageIcon, Loader2, CheckCheck, Clock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import type { Role } from '@/lib/types'
import type { ChatMessage, Conversation, Recipient, MessageKind } from './chat-types'

export function ChatCenter({ userId }: { userId: string }) {'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { apiGet, apiPost } from '@/lib/api-client'
import at
import { uionimport { apiGet, apiPost } from '@/lib/api-client'
import { toaesimport { toast } from 'sonner'
import { MessageCi uimport { MessageCircle, Searcnsimport { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
imporse)
  const [loadingimport { Input } from '@/components/ui/input'
alse)
  const [newMessage, setNewMessage] = useSimport { Badge } from '@/components/ui/badge'
impofaimport { ScrollArea } from '@/components/ui/ uimport { Avatar, AvatarFallback } from '@/components/ui uimport { Dialog, DialogContent, DialogHeader, DialogTitle, Diaseimport type { Role } from '@/lib/types'
import type { ChatMessage, Conversation, Recipient, MessageKindteimport type { ChatMessage, Conversatiost
export function ChatCenter({ userId }: { userId: string }) {'use client'

import { tRe
import { useState, useRef, useEffect, useCallback } from 'react'
imporbacimport { apiGet, apiPost } from 'onst res = await apiGet<{ converimport at
import { uionimport { apiGet, apiPost }nsimport { simport { toaesimport { toast } from 'sonner'
import { MessageCt.import { MessageCi uimport { MessageCircle,tiimport { Input } from '@/components/ui/input'
imporse)
  const [loadingimport { Input } from '@/cc imporse)
  const [loadingimport { Input } friG  constcialse)
  const [newMessage, setNewMessage] = useSimport { Badpi nts(rimpofaimport { ScrollArea } from '@/components/ui/ uimport { Avatar, AvatarFallback } ntimport type { ChatMessage, Conversation, Recipient, MessageKindteimport type { ChatMessage, Conversatiost
export function ChatCenter({ userId }: { userId: string }) {'use client'

import { tRe
import { useState,}>export function ChatCenter({ userId }: { userId: string }) {'use client'

import { tRe
import { useStateat
import { tRe
import { useState, useRef, useEffect, useCallback } from errimport { use imporbacimport { apiGet, apiPost } from 'onst res = await apiGeseimport { uionimport { apiGet, apiPost }nsimport { simport { toaesimport { toast }onimport { MessageCt.import { MessageCi uimport { MessageCircle,tiimport { Input } from '@/compoedimporse)
  const [loadingimport { Input } from '@/cc imporse)
  const [loadingimport { Input } friG  constciro  constie  const [loadingimport { Input } friG  constcialse)ha  const [newMessage, setNewMessage] = useSimport {orexport function ChatCenter({ userId }: { userId: string }) {'use client'

import { tRe
import { useState,}>export function ChatCenter({ userId }: { userId: string }) {'use client'

import { tRe
import { useStateat
import { tRe
import { useState, useRef, t:
import { tRe
import { useState,}>export function ChatCenter({ userId }.coimport { usud
import { tRe
import { useStateat
import { tRe
import { useState, useRef, useEffect, useCal seimport { usatimport { tRe
imporerimport { us t  const [loadingimport { Input } from '@/cc imporse)
  const [loadingimport { Input } friG  constciro  constie  const [loadingimport { Input } friG  constcialse)ha  const [newMessage, setNewMessage] = useSimport {orexport function ChatCenter({ userId }: { userId: string }) {'use client'

import { tRe
import { useState,}>exin  const [loadingimport { Input } friG  constciro  c
 
import { tRe
import { useState,}>export function ChatCenter({ userId }: { userId: string }) {'use client'

import { tRe
import { useStateat
import { tRe
import { useState, useRef, t:
import { tRe
import { useState,}>export function nd import { usNT
import { tRe
import { useStateat
import { tRe
import { useState, useRef, t:
import { tRe
iON'import { usciimport { tRe
imporneimport { usphimport { tRe
import { useSta? import { usBaimport { tRe
import { useStateat
import { tRe
import { useState, useRef,: import { us  import { tRe
imporinimport { usE'imporerimport { us t  const [loadingimport { Input } from '@/cc imporseag  const [loadingimport { Input } friG  constciro  constie  const [loadies
import { tRe
import { useState,}>exin  const [loadingimport { Input } friG  constciro  c
 
import { tRe
import { useState,}>export function ChatCenter({ userId }: { userId: string }) {'use client'

import { tRe
import { useStateat
i.meimport { usai 
import { tRe
import { useState,}>export function ChatCenter({ userId }: dlePimport { us= 
import { tRe
import { useStateat
import { tRe
import { useState, useRef, t:
import { tRe
i('iimport { ustuimport { tRe
imporlyimport { usowimport { tRe
impe.size > 10 * import { us) import { tRe
import { useStateatge (max 10MB)')
    simport { usruimport { tRe
impor cimport { usewimport { tRe
iON'import { us'fiON'import 
 imporneimport { usphimport {Idimport { useSta? import { usBai  import { useStateat
import { tRe
import {d'import { tRe
impor, import { us
 imporinimport { usE'imporerimport { us t  const [loa) import { tRe
import { useState,}>exin  const [loadingimport { Input } friG  constciro  c
 
import { tRe
import { useState,}>export function ChatCenter({ userId }: { phimport { usta 
import { tRe
import { useState,}>export function ChatCenter({ userId }: d') import { usly
import { tRe
import { useStateat
i.meimport { usai 
import { t: Promise<string> => new Promisimport { us) i.meimport { usai deimport { tRe
impor(import { usr.import { tRe
import { useStateat
import { tRe
import { useState, useRef, t:adimport { ustaimport { tRe
imporcoimport { usdCimport { tRe
i('iimport { us.fi('iimport   imporlyimport { usowimport {asimpe.size > 10 * import { us) irCimport { useStateatge (max 10MB)')
    sise    simport { usruimport { tRe
iaseimpor cimport { usewimport { : iON'import { us'fiON'import 
 iew imporneimport { usphimport dimport { tRe
import {d'import { tRe
impor, import { us
 imporinimport { usE'imporereimport {d'ioLimpor, import { us
 i h imporinimport { inimport { useState,}>exin  const [loadingimport { Input } friG  conay 
import { tRe
import { useState,}>export function ChatCenter({ userId }:  datimport { usatimport { tRe
import { useState,}>export function ChatCenter({ userId }: d')  (import { us=>import { tRe
import { useStateat
i.meimport { usai 
import { t: Promise<str
 import { usnei.meimporatMessage) import { t: Promi mimpor(import { usr.import { tRe
import { useStateat
import { tRe
import { useState, u: import { useStateat
import { torimport { tRe
impor'bimport { us')imporcoimport { usdCimport { tRe
i('iimport { us.fi('iiSAi('iimport { usOfficer', RESPONDE    sise    simport { usruimport { tRe
iaseimpor cimport { usewimport { : iON'import { us'fiON'import 
 iew imporneimport { usleiaseimpor cimport { usewimport { : iOfl iew imporneimport { usphimport dimport { tRe
import {d'importndimport {d'import { tRe
impor, import { us
 ierimpor, import { us
 ie  imporinimport { 5  i h imporinimport { inimport { useState,}>exin  const [loaicimport { tRe
import { useState,}>export function ChatCenter({ userId }:  datimport { usatimtaimport { us)}import { useState,}>export function ChatCenter({ userId }: d')  (import { us=>import {  cimport { useStateat
i.meimport { usai 
import { t: Promise<str
 import { usnei.meimporatMoli.meimport { usai  -import { t: Promi-4 import { usnei.meimpoouimport { useStateat
import { tRe
import { useState, u: import { useStateat
import {> import { tRe
imporarimport { us cimport { torimport { tRe
impor'bimport {v>impor'bimport { us')impasi('iimport { us.fi('iiSAi('iimport { usOfficer', RENaiaseimpor cimport { usewimport { : iON'import { us'fiON'import 
 iew imporneimport { usleiasei-f iew imporneimport { usleiaseimpor cimport { usewimport { : iOivimport {d'importndimport {d'import { tRe
impor, import { us
 ierimpor, import { us
 ie  imporinimport { 5  ih-impor, import { us
 ierimpor, import { ex ierimpor, importti ie  imporinimport {   import { useState,}>export function ChatCenter({ userId }:  datimport { usatimtaimport { us)}im  i.meimport { usai 
import { t: Promise<str
 import { usnei.meimporatMoli.meimport { usai  -import { t: Promi-4 import { usnei.meimpoouimport { useStateat
import { tRe
import { useState, u: import { us>
import { t: Promi < import { usnei.meimpo wimport { tRe
import { useState, u: import { useStateat
import {> import { tRe
imporarimport { us cimport { toicimport { ushaimport {> import { tRe
imporarimport { uAvimporarimport { us ci  impor'bimport {v>impor'bimport { us')impasi   iew imporneimport { usleiasei-f iew imporneimport { usleiaseimpor cimport { usewimport { : iOivimport {d'importndimport {d'import { tRe
impor, import { us
t-ximpor, import { us
 ierimpor, import { us
 ie  imporinimport { 5  ih-impor, import { us
 ierimpor, imlex items-center gap-2">
            ierimpor, import v ie  imporinimport { sN ierimpor, import { ex ierimpor, importti ie.pimport { t: Promise<str
 import { usnei.meimporatMoli.meimport { usai  -import { t: Promi-4 import { usnei.meimpoouimport { useStateat
import { tRe
import { useState, u: import {}{ import { usnei.meimpo==import { tRe
import { useState, u: import { us>
import { t: Promi < import { usnei.meimpo wimport { tRe
imporEXimport { uslaimport { t: Promi < import { usnes'import { useState, u: import { useStateat
import {> i </import {> import { tRe
imporarimport { u&&imporarimport { usecondimporarimport { uAvimporarimport { us ci  impor'bimport {v>impor'bi  impor, import { us
t-ximpor, import { us
 ierimpor, import { us
 ie  imporinimport { 5  ih-impor, import { us
 ierimpor, imlex items-center gap-2">
            ierimpor, import v ie  imporinimport { sN ierimpor, import { ejut-ximpor, import 4  ierimpor, import { kg ie  imporinimport { cl ierimpor, imlex items-center gap-2">
       <            ierimpor, import v ie  inC import { usnei.meimporatMoli.meimport { usai  -import { t: Promi-4 import { usnei.meimpoouimport { useStateat
import { t-9import { tRe
import { useState, u: import {}{ import { usnei.meimpo==import { tRe
import { useState, u: impor"}import { usonimport { useState, u: import { us>
import { t: Promi < import { usn</import { t: Promi < import { usneNaimporEXimport { uslaimport { t: Promi < import { usicipaimport {> i </import {> import { tRe
imporarimport { u&&imporarimport { usecondimporarimport { "timporarimport { u&&imporarimport { ect-ximpor, import { us
 ierimpor, import { us
 ie  imporinimport { 5  ih-impor, import { us
 ierimpor, imlex items-center gap-2"> < ierimpor, import { t" ie  imporinimport { {s ierimpor, imlex items-center gap-2">
      on            ierimpor, import v ie  iam       <            ierimpor, import v ie  inC import { usnei.meimporatMoli.meimport { usai  -import { t: Promi-4 import { usnei.meimpoouimport { useStateat
import {geIcon classNimport { t-9import { tRe
import { useState, u: import {}{ import { usnei.meimpo==import { tRe
import { useState, u: impor"}import { usonimport { useState, ; import { useState, u: id(import { useState, u: impor"}import { usonimport { useState, u: impeximport { t: Promi < import { usn</import { t: Promi < import { usneNaimporEMsimporarimport { u&&imporarimport { usecondimporarimport { "timporarimport { u&&imporarimport { ect-ximpor, import { us
 ierimpor, import { us
 ie  imporinimportla ierimpor, import { us
 ie  imporinimport { 5  ih-impor, import { us
 ierimpor, imlex items-center gap-2"> < ierimporop ie  imporinimport { me ierimpor, imlex items-center gap-2"> < ieri        on            ierimpor, import v ie  iam       <            ierimpor, import v ie  inC import { usnei.meimporatMolgeimport {geIcon classNimport { t-9import { tRe
import { useState, u: import {}{ import { usnei.meimpo==import { tRe
import { useState, u: impor"}import { usonimport { useState, ; import { useState, u: iarimport { useState, u: import {}{ import { us-simport { useState, u: impor"}import { usonimport { useState, ; impor  ierimpor, import { us
 ie  imporinimportla ierimpor, import { us
 ie  imporinimport { 5  ih-impor, import { us
 ierimpor, imlex items-center gap-2"> < ierimporop ie  imporinimport { me ierimpor, imlex items-center gap-2"> < ieri        on            ierimpor, import v ie  iam       <            ierimpor, import v ie  inC import { usnei.meimporatMolge ie  imporinimportla "  ie  imporinimport { 5  ih-impor, import ta ierimpor, imlex items-center gap-2"> < ierin(import { useState, u: import {}{ import { usnei.meimpo==import { tRe
import { useState, u: impor"}import { usonimport { useState, ; import { useState, u: iarimport { useState, u: import {}{ import { us-simport { useState, u: impor"}import { usonimport { useState, ; impor  ierimpor, imt-import { useState, u: impor"}import { usonimport { useState, ; impoex ie  imporinimportla ierimpor, import { us
 ie  imporinimport { 5  ih-impor, import { us
 ierimpor, imlex items-center gap-2"> < ierimporop ie  imporinimport { me ierimpor, imlex items-center gap-2"> < ieri        on        ex ie  imporinimport { 5  ih-impor, import gT ierimpor, imlex items-center gap-2"> < ieri  import { useState, u: impor"}import { usonimport { useState, ; import { useState, u: iarimport { useState, u: import {}{ import { us-simport { useState, u: impor"}import { usonimport { useState, ; impor  ierimpor, imt-import { useState, u: impor"}import { usonimport { useState, ; impoex ie  imporinimportla ierimpor, import { us
 ie  imporinimport { 5  ih-impor, import { us
 ierimpor, imlex items-center gap-2"> < ierieg ie  imporinimport { 5  ih-impor, import { us
 ierimpor, imlex items-center gap-2"> < ierimporop ie  imporinimport { me ierimpor, imlex items-center gap-2"> < ieri        on        ex ie  imporinimport { 5  ih-impor, import gT ierimpor, imlex items-center gap-2"> < ieri  import { useState, u: impor"}import { usonimport { useStim ierimpor, imlex items-center gap-2"> < ieri.r ie  imporinimport { 5  ih-impor, import { us
 ierimpor, imlex items-center gap-2"> < ierieg ie  imporinimport { 5  ih-impor, import { us
 ierimpor, imlex items-center gap-2"> < ierimporop ie  imporinimport { me ierimpor, imlex items-center gap-2"> < ieri        on        ex ie  imporinimport { 5  ih-impor, import gT ierimpor, imlex items-center gap-2"> < ieri  import { useState, u: impor"}import { usonimport { useStim ierimpor, imlex items-center gap-2"> < ieri.r ie  imporinimport { 5  ih-impor, import { us
 ierimpor, imlex items-center gap-2"> < ar ierimpor, imlex items-center gap-2"> < ieriss ierimpor, imlex items-center gap-2"> < ierimporop ie  imporinimport { me ierimpor, imlex ss ierimpor, imlex items-center gap-2"> < ierieg ie  imporinimport { 5  ih-impor, import { us
 ierimpor, imlex items-center gap-2"> < ierimporop ie  imporinimport { me ierimpor, imlex items-center gap-2"> < ieri        on        ex ie  imporinimport { 5  ih-impor, import gT ierimpor, imlex items-center gap-2"> < ieri  import { useState, u: impor"}import { usonimport { useSt2" ierimpor, imlex items-center gap-2"> < ierimporop ie  imporinimport { me ierimpond classNam ierimpor, imlex items-center gap-2"> < ar ierimpor, imlex items-center gap-2"> < ieriss ierimpor, imlex items-center gap-2"> < ierimporop ie  imporinimport { me ierimpor, imlex ss ierimpor, imlex items-center gap-2"> < ierieg ie  imporinimport { 5  ih-impor, import { us
 ierimpor, imlex items-center gap-2"> < ierimporop ie  imporinimport { me ierimpor, imlex items-center>  ierimpor, imlex items-center gap-2"> < ierimporop ie  imporinimport { me ierimpor, imlex items-center gap-2"> < ieri        on        ex ie  imporinimport { 5  ih-impor, import gT ierimpor, imlex items-center gap-2"> < ieri  import { useState, u: impor"}import { usonimr> ierimpor, imlex items-center gap-2"> < ierimporop ie  imporinimport { me ierimpor, imlex items-center>  ierimpor, imlex items-center gap-2"> < ierimporop ie  imporinimport { me ierimpor, imlex items-center gap-2"> < ieri        on        ex ie  imporinimport { 5  ih-impor, import gT ierimpor, imlex items-center gap-2"> < ieri  import { useState, u: impor"}import { usonimr> ierimpor, imlex items-center gap-2"> < ierimporop ie  imporinimport { me ierimpor, imlex items-center>  ierimpor, imlex items-center gap-2"> < ierimporop ie  imporinimport { me ierimpor, imlex items-center gap-2"> < ieri        on        ex ie  imporinimport { 5  ih-imerCase()) || r.role.toLowerCase().includes(searchQuery.toLowerCase())).length === 0 ? <p className="text-sm text-muted-foreground text-center py-4">No recipients found</p> :
          <div className="space-y-1">
            {recipients.filter(r => r.name.toLowerCase().includes(searchQuery.toLowerCase()) || r.role.toLowerCase().includes(searchQuery.toLowerCase())).map(recipient => (
              <button key={recipient.id} onClick={() => { apiPost('/api/chat/conversations', { recipientId: recipient.id }).then(res => { setShowStartChat(false); setSelectedConversation({ id: res.conversation.id, participantId: res.conversation.participantId, participantName: res.conversation.participantName, participantRole: res.conversation.participantRole as Role, participantEmail: res.conversation.participantEmail, participantPhone: res.conversation.participantPhone, lastMessage: null, lastAt: '', unread: 0 }); setSearchQuery('') }).catch(e => toast.error((e as any).message || 'Failed to start chat')) }} className="w-full flex i          <div className="space-y-1">
            {recipients.filter(r => r.name.toLowerCase().includes(searchQuery.toLowerCase()) || r.role.toLowerCase().includes(searchte            {recipients.filter(r => en              <button key={recipient.id} onClick={() => { apiPost('/api/chat/conversations', { recipientId: recipient.id }).then(res => { setShowStartChat(false); setSelec="            {recipients.filter(r => r.name.toLowerCase().includes(searchQuery.toLowerCase()) || r.role.toLowerCase().includes(searchte            {recipients.filter(r => en              <button key={recipient.id} onClick={() => { apiPost('/api/chat/conversations', { recipientId: recipient.id }).then(res => { setShowStartChat(false); setSelec="            {recipients.filter(r => r.name.toLowerCase().includes(searchQuery.toLowerCase()) || r.role.toLowerCase().includes(searchte            {recipients.filter(r => en              <button key={recipient.id} onClick={() => { apiPost('/api/chat/conversations', { recipientId: recipient.id }).then(res => { setShowStartChat(false.unread, 0)}
          </Badge>
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-6xl max-h-[90vh] p-0 overflow-hidden" onOpenChange={o => !o && setShowStartChat(false)}>
        <DialogHeader className="sr-only"><DialogTitle>Communication Center</DialogTitle></DialogHeader>
        {!selectedConversation ? convList() : chatView()}
      </DialogContent>
      {showStartChat && newChatList()}
    </Dialog>
  )
}
