# Forms — react-hook-form + shadcn Field

## TL;DR (อ่านทวนเร็ว)

- **ฟอร์มมี 2 ชั้นที่แยกกันชัด** — `react-hook-form` ดูแล *ค่าและ error* · `Field` ของ shadcn ดูแล *หน้าตา* · ทั้งสองไม่รู้จักกัน เราเป็นคนต่อสาย
- **`register` คือ default · `Controller` คือทางหนี** — doc ของ react-hook-form เขียนว่ามัน *"embraces uncontrolled components and native inputs"* และ `Controller` มีไว้สำหรับ component ภายนอกที่บังคับให้เป็น controlled
- **เช็คว่าใช้ `register` ได้ไหม 2 ข้อ**: component ส่ง `ref` ถึง `<input>` จริงไหม · ยิง `onChange(event)` ที่มี `event.target.value` ไหม — ครบ 2 ข้อ = `register`, ขาดข้อใด = `Controller`
- **ห้ามใช้คู่กันในช่องเดียว** `{...field} {...register(...)}` = ลงทะเบียนซ้ำ (doc เตือนไว้ตรงๆ)
- **`errors.name` เป็น object ไม่ใช่ string** — `{ type, message?, ref?, types? }` ข้อความอยู่ที่ `.message`
- **`errors.root` เป็นช่องที่ react-hook-form จองไว้** สำหรับ error ระดับฟอร์มที่ไม่ใช่ของช่องไหน · `register("root")` ไม่ได้ · **ไม่ค้างข้าม submit** (RHF ล้างให้เอง)
- **`defaultValues` ใส่เสมอ** — doc แนะนำให้ใส่ที่ระดับฟอร์ม · ไม่ใส่ก็ validate ได้ แต่ `isDirty` / `watch` / `reset` จะเทียบกับอะไรไม่ได้
- **`setError(name, err, { shouldFocus: true })`** ย้าย cursor ไปช่องที่ต้องแก้ · server error กับ zod error เข้าประตูเดียวกัน
- **`FieldError` มี 2 ทางเข้า** — `errors={[...]}` (รับ object) กับ `children` (รับ string) · `children` ชนะเงียบๆ ถ้าส่งทั้งคู่ · **โปรเจกต์นี้ใช้ `errors` ท่าเดียว**
- **`FieldError` คืน `null` เมื่อไม่มีอะไรจะแสดง** → ไม่ต้องเขียน `{errors.x && ...}` ครอบ
- **`Field` ของ shadcn ไม่ทำ `useId` / `htmlFor` / `aria-invalid` / `aria-describedby` ให้** — ตั้งใจ เพื่อให้ใช้กับ form library ไหนก็ได้ · **ทุกตัวอย่างใน doc ก็เขียน id เองทั้งหมด**
- **โปรเจกต์นี้ไม่ห่อ field เป็น component กลาง** เคยทำแล้ว revert — เหตุผลอยู่หัวข้อ 8

---

## 1. ปัญหาต้นทาง — ค่าของ input อยู่ที่ไหน

ฟอร์มต้องการสิ่งเดียวตลอด: **"ตอนกด submit ค่าในแต่ละช่องคืออะไร"**

React เก็บค่าได้ 2 แบบ และนี่คือต้นตอว่าทำไม react-hook-form ต้องมี 2 ท่า

```
uncontrolled  →  ค่าอยู่ใน DOM          React ไม่รู้ ต้องไปอ่านตอนจะใช้
controlled    →  ค่าอยู่ใน React state  React รู้ตลอด ทุกตัวอักษรที่พิมพ์
```

```jsx
<input defaultValue="a" />                                // uncontrolled
<input value={v} onChange={e => setV(e.target.value)} />  // controlled
```

`register` ทำงานบนแบบแรก · `Controller` ทำงานบนแบบที่สอง

---

## 2. `register` — ให้ DOM ถือค่าไว้

มันคืน object 4 key (จาก `UseFormRegisterReturn` ใน `node_modules/react-hook-form/dist/types/form.d.ts:131`)

```ts
register("email")  →  {
  name:     "email",
  ref:      (node) => {...},   // ← ตัวสำคัญที่สุด
  onChange: (e) => {...},
  onBlur:   (e) => {...},
}
```

กระจายลง input ทีเดียว:

```tsx
<Input id="create-user-email" {...register("email")} />
```

**`ref` คือหัวใจ** — RHF ขอตัวชี้ไปยัง DOM node จริงเก็บไว้ พอ submit ก็ไปอ่าน `node.value` ตรงๆ

ผลที่สำคัญ: **พิมพ์แล้ว component ไม่ re-render** เพราะค่าไม่ได้อยู่ใน React state — เป็นจุดขายหลักของ library นี้

### ref ไหลผ่าน component ซ้อนได้ (React 19)

`PasswordInput` ไม่มี `forwardRef` ให้เห็นเลย แต่ `register` ยังทำงาน:

```
register("password")
   → PasswordInput ({...props})     ← React 19 ส่ง ref เป็น prop ธรรมดา
      → Input ({...props})
         → <input>                  ← ref ถึงตรงนี้
```

**พิสูจน์โดย test ที่มีอยู่** — `"sends exactly name, email and password"` ใน `CreateUserForm.test.tsx` จะผ่านได้ก็ต่อเมื่อ RHF อ่านค่า password ผ่าน ref ที่ทะลุ 2 ชั้นถึง `<input>` จริง

> React เวอร์ชันก่อน 19 ต้องห่อด้วย `forwardRef` ถึงจะได้ผลแบบนี้ — เจอโค้ดเก่าที่ใช้ `forwardRef` ไม่ต้องตกใจ

---

## 3. `Controller` — ให้ RHF ถือค่าแทน

ใช้ตอน component **ไม่รับ ref** หรือ **ไม่ยิง DOM event มาตรฐาน**

```tsx
<Controller
  name="role"
  control={control}
  render={({ field, fieldState }) => (
    <Select
      value={field.value}             // ← RHF ยื่นค่าปัจจุบันลงไป
      onValueChange={field.onChange}  // ← component ส่งค่าใหม่กลับขึ้นมา
    />
  )}
/>
```

`render` เป็น function ที่รับค่าแล้วคืน element และ `field` ที่ได้มามี `{ name, value, onChange, onBlur, ref, disabled }` ส่วน `fieldState` มี `{ invalid, isTouched, isDirty, error }`

> `fieldState.invalid` **เป็น boolean อยู่แล้ว** — นี่คือเหตุผลที่ตัวอย่างใน doc ของ shadcn เขียน `aria-invalid={fieldState.invalid}` เฉยๆ ไม่มี `!!` ส่วนเราที่ใช้ `register` มีแต่ `errors.email` ที่เป็น object เลยต้องแปลงเอง (หัวข้อ 6)

---

## 4. เลือกยังไง

doc เขียนไว้ตรงๆ:

> *"React Hook Form embraces uncontrolled components and native inputs, however it's hard to avoid working with external controlled component such as React-Select, AntD and MUI. This wrapper component will make it easier."*

แปลเป็นกฎใช้งาน:

```
default คือ register
Controller คือทางหนีตอน register ใช้ไม่ได้
```

**เช็ค 2 ข้อ:**

```
1. component ส่ง ref ต่อจนถึง <input>/<select>/<textarea> จริงไหม?
2. มันยิง onChange(event) ที่มี event.target.value ไหม?

ครบ 2 ข้อ  →  register
ขาดข้อใด   →  Controller
```

ดูจาก **props ที่ component ประกาศ** ก็เดาออกเกือบทุกครั้ง:

| component ขอ props แบบนี้ | ใช้ |
| --- | --- |
| `value` + `onChange(event)` + รับ `ref` | `register` |
| `value` + `onValueChange(string)` — Radix Select | `Controller` |
| `selected` + `onSelect(Date)` — date picker | `Controller` |
| `value` + `onChange(option)` — react-select | `Controller` |
| `checked` + `onCheckedChange(boolean)` — Radix Checkbox | `Controller` |

สังเกตว่าตัวที่ต้อง `Controller` มักเป็นพวกที่**ส่งคืนค่าตรงๆ ไม่ใช่ event**

### โปรเจกต์นี้ใช้ `register` ทั้งหมด

5 ช่องในแอปลงท้ายที่ `<input>` จริงหมด — `CreateUserForm` 3 ช่อง (`:121`, `:135`, `:146`) และ `LoginPage` 2 ช่อง (`:96`, `:107`)

**ครั้งแรกที่จะได้ใช้ `Controller`** คือตอนฟอร์มมี dropdown — เช่น เลือก category / assignee ของ ticket ใน Phase 4 ซึ่งเป็น Radix Select ที่ให้ `onValueChange(string)`

### กับดัก: ห้ามใช้คู่กัน

```jsx
<input {...field} {...register('test')} />   // ❌ ลงทะเบียน 2 รอบ
<input {...field} />                          // ✅ Controller จัดการให้แล้ว
```

---

## 5. schema — zod + zodResolver

```tsx
const createUserSchema = z.object({ ... });        // CreateUserForm.tsx:26
type CreateUserValues = z.infer<typeof createUserSchema>;

useForm<CreateUserValues>({
  resolver: zodResolver(createUserSchema),         // :70
})
```

schema เดียวเป็นทั้ง **กฎ** (ตรวจตอน submit) และ **type** (`z.infer` สร้าง TS type ให้) — แก้ที่เดียว ไม่มีทางหลุดกัน

`handleSubmit(onSubmit)` รัน validate ก่อนเสมอ · `onSubmit` ถูกเรียกเฉพาะตอนผ่าน และได้ `data` ที่ type ถูกต้องแล้ว

> schema ฝั่ง client **ไม่ใช่ security boundary** — server ตรวจซ้ำทุกฟิลด์ เพราะอะไรที่ fetch ถึงได้ curl ก็ถึงได้ · สำเนาฝั่ง server อยู่ที่ `server/src/users/create-user.ts` และตัวที่กันสองฝั่งไม่ให้หลุดกันคือ E2E spec *"POST /api/users is 400 when the password is shorter than 8 characters"*

---

## 6. `defaultValues` — ใส่เสมอ

```tsx
useForm<CreateUserValues>({
  resolver: zodResolver(createUserSchema),
  defaultValues: { name: "", email: "", password: "" },   // :75
})
```

doc เขียนว่า *"it is **recommended** to use `defaultValues` for the entire form"* และ *"Avoid providing `undefined` as a default value"*

**ไม่ใส่ก็ยังทำงาน** เพราะ input เป็น uncontrolled → RHF อ่าน `""` จาก DOM อยู่แล้ว validate จึงถูกต้อง

**แต่จะเจ็บตอนใช้ของพวกนี้** เพราะมันเทียบกับ `defaultValues`:

```
isDirty   →  "มีอะไรถูกแก้หรือยัง"   ← ปุ่ม Save ควร disable ถ้ายังไม่แก้
watch     →  อ่านค่าสดๆ ระหว่างพิมพ์
reset     →  คืนฟอร์มกลับค่าเริ่มต้น
```

ฟอร์ม **edit user** จะเป็นตัวแรกที่ต้องใช้ครบทั้งสาม (prefill ข้อมูลเดิม + คุมปุ่ม Save)

> ไม่มี test ตัวไหนจับ `defaultValues` ได้ตอนนี้ — พิสูจน์แล้วด้วยการลบออกแล้วรัน: 20/20 ยังเขียว เพราะยังไม่มีโค้ดที่ใช้ `isDirty`/`reset` มันจึงเป็น config ที่ยังไม่มีพฤติกรรมให้วัด

---

## 7. `errors` — รูปร่างและการ set

### `errors.<field>` เป็น object ไม่ใช่ string

จาก type จริงใน `node_modules/react-hook-form/dist/types/errors.d.ts`

```ts
type FieldError = {
  type: string;      // rule ไหนที่พัง
  message?: string;  // ← ข้อความที่จะโชว์ อยู่ในนี้
  ref?: Ref;         // DOM node ของช่องนั้น
  types?: {...};     // หลายข้อความพร้อมกัน (ต้องเปิด criteriaMode: "all")
};
```

ตอน submit ฟอร์มเปล่า:

```js
errors = {
  name:  { type: "...", message: "Name is required.",            ref: <input> },
  email: { type: "...", message: "Enter a valid email address.", ref: <input> },
  // password ผ่าน → ไม่มี key นี้เลย (ไม่ใช่ undefined — ไม่มี key)
}
```

เพราะงั้น `{errors.email}` ตรงๆ render ไม่ได้ ต้อง `.message`

### `errors.root` — ช่องที่ถูกจองไว้

```
errors.name   →  ช่อง Name ผิด        ← ผูกกับ input
errors.root   →  เรื่องของทั้งฟอร์ม    ← ไม่ผูกกับ input ไหน
```

`root` เป็นคำสงวน · `register("root")` ไม่ได้ · type คือ `GlobalError = Partial<{ type, message }>` — มี `.message` เหมือน field error

**ถูก set ที่เดียวในแอป** — `CreateUserForm.tsx:99` ตอน API ล้มด้วยเหตุผลที่ไม่ใช่อีเมลซ้ำ (500 / เน็ตหลุด / DB ล่ม) ซึ่งคนกรอกไม่ได้ทำอะไรผิด เลยบอกไม่ได้ว่าช่องไหนผิด

> doc ระบุว่า error ที่ key `root` **ไม่ค้างข้าม submit** RHF ล้างให้เองตอนกดส่งใหม่ — ต่างจาก field error ที่ต้องแก้ค่าให้ผ่าน validation ถึงจะหาย
>
> doc ใช้ `"root.serverError"` ในตัวอย่าง เราใช้ `"root"` เปล่าๆ เพราะยังมี global error แบบเดียว — ถ้ามีแบบที่สอง (เช่น validation ข้ามช่อง) ค่อยแยก namespace

### server error เข้าประตูเดียวกับ zod

```tsx
try {
  await mutateAsync(values);
  onCreated();
} catch (error) {
  if (isAxiosError(error) && error.response?.status === 409) {
    setError("email", { message: "That email address is already in use." },
             { shouldFocus: true });            // :89-94
    return;
  }
  setError("root", { message: "Could not create the user..." });   // :99
}
```

doc แนะนำท่านี้ตรงๆ: `try/catch` รอบ async request แล้ว `setError` ใน catch — และมันทำให้ `isSubmitSuccessful` ไม่เป็น `true` ด้วย

**`shouldFocus: true`** ย้าย cursor ไปช่องที่ต้องแก้ ไม่งั้นมันค้างอยู่ที่ปุ่ม submit ที่เพิ่งกด (ทำงานผ่าน `ref` ที่ `register` เก็บไว้ — อีกเหตุผลที่ ref สำคัญ)

---

## 8. `Field` ของ shadcn — หน้าตาล้วนๆ

### ชิ้นส่วน

| ชิ้น | หน้าที่ |
| --- | --- |
| `FieldGroup` | กล่องครอบทั้งฟอร์ม (`flex flex-col gap-5`) |
| `Field` | กล่องครอบ 1 field (`flex flex-col gap-2`, `role="group"`) |
| `FieldLabel` | label (shadcn `Label` + `data-slot`) |
| `FieldError` | ข้อความ error |
| `FieldSet` + `FieldLegend` | สำหรับ radio/checkbox group |
| `FieldDescription` | hint ที่โชว์ถาวร (ยังไม่ได้ใช้) |

ระยะห่างตรงกับที่เคยเขียนมือเป๊ะ: `FieldGroup` = `space-y-5` เดิม · `Field` = `space-y-2` เดิม

`Field` รับ `data-invalid` → CSS `data-[invalid=true]:text-destructive` ทำให้ **label เปลี่ยนเป็นสีแดง**ตอน error

### `FieldError` ตัดสินใจยังไง

บันได 4 ขั้นใน `client/src/components/ui/field.tsx`

```
[183]  มี children ไหม          →  มี   : ใช้ children จบ (errors ถูกเมินทั้งหมด)
[187]  errors ว่าง / ไม่ส่งมา    →  ว่าง : return null
[195]  errors เหลือ 1 ข้อความ    →  คืน string ธรรมดา
[199]  errors เหลือ 2+ ข้อความ   →  คืน <ul> bullet list
```

ก่อนขั้น 195 มันลบข้อความซ้ำก่อน (`new Map` keyed ด้วย message)

```jsx
errors={[errors.name]}                     // 1 → <div role="alert">Name is required.</div>
errors={[errors.password, errors.confirm]} // 2 → <div role="alert"><ul><li>…</li><li>…</li></ul></div>
```

**โค้ดเราส่ง 1 ตัวตลอด เลยไม่เคยเห็น bullet** — ผลหน้าตาเหมือน `children` เป๊ะ ต่างกันแค่ `errors` รับ *object* แล้วขุด `.message` ให้ ส่วน `children` รับ *string* ที่เราขุดเอง

ที่ `:209` มี `if (!content) return null` → **ไม่ render div เปล่า** นี่คือเหตุผลที่เขียน `<FieldError errors={[errors.root]} />` ได้โดยไม่ต้องมี `{errors.root && ...}` ครอบ

ที่ `:215` มี `role="alert"` → **screen reader อ่านออกเสียงทันทีตอน element โผล่มา** (อยู่หลังการเช็ค `null` เลยไม่มี alert เปล่าค้างตั้งแต่โหลดหน้า)

### สิ่งที่ `Field` **ไม่** ทำ — และตั้งใจไม่ทำ

ไม่มี `useId` · ไม่มี `htmlFor` อัตโนมัติ · ไม่มี `aria-invalid` · ไม่มี `aria-describedby`

เพราะมันต้องใช้ได้กับ react-hook-form / TanStack Form / Formisch / Server Actions เหมือนกันหมด

`form.tsx` รุ่นเก่าของ shadcn เคยทำให้ผ่าน context — **แต่ตกรุ่นไปแล้ว และใน style `radix-nova` ของโปรเจกต์นี้ `form.json` ไม่มีไฟล์เลย** (`shadcn add form` จะไม่ได้อะไรแต่รายงานว่าสำเร็จ)

### ทำไมไม่ห่อเป็น component กลาง

เคยสร้าง `FormField` แล้ว **revert ออก** (2026-10-20) เหตุผล:

- **ทุกตัวอย่างใน doc ของ shadcn ก็ไม่ wire `aria-describedby`** — ตอนแรกเข้าใจว่าเป็นช่องว่างที่ต้องอุด แต่มันเป็นการตัดสินใจของเขา การอ่าน source ของ component บอกได้ว่ามันทำอะไรได้ แต่บอกไม่ได้ว่าควรใช้ยังไง
- **โค้ดที่ตรงกับ doc ค้นหาได้** tutorial / Stack Overflow / AI อธิบายให้ได้หมด ส่วน wrapper ของเราเองไม่มีใครอธิบายให้นอกจากเอกสารที่เราเขียน
- **เหตุผลที่เคยใช้ (linter เตือนว่าเกิน 100 บรรทัด) เป็นเหตุผลที่ผิด** — ตัวจริงคือกฎนับ comment เป็นบรรทัดด้วย ทั้งที่ repo นี้เขียน comment หนาแน่นเป็นสไตล์ · แก้ด้วย `skipComments: true` (commit `77c0154`) ไม่ใช่บิดโครงโค้ด

`aria-describedby` ถูกบันทึกไว้ใน **Known gaps** ของ `CLAUDE.md` แทน — trigger คือ a11y pass หรือฟอร์มที่ 3-4

---

## 9. ท่าที่โปรเจกต์นี้ใช้ — 1 field หน้าตานี้

```tsx
<Field data-invalid={!!errors.email}>
  <FieldLabel htmlFor="create-user-email">Email</FieldLabel>
  <Input
    id="create-user-email"
    type="email"
    autoComplete="off"
    aria-invalid={!!errors.email}
    {...register("email")}
  />
  <FieldError errors={[errors.email]} />
</Field>
```

`id` กับ `htmlFor` คู่กันด้วยมือ · `aria-invalid` บน control · `data-invalid` บน `Field` · `FieldError` รับ object

### `!!error` ทำไมต้องมี

`errors.email` เป็น object หรือ `undefined` แต่ `aria-invalid` / `data-invalid` ต้องการ **boolean**

```
!!{ message: "..." }  →  true
!!undefined           →  false
```

ถ้าส่ง object ตรงๆ — **DOM attribute เก็บได้แค่ string** React จึง `String(object)`:

```
data-invalid={errors.name}   →  <div data-invalid="[object Object]">
                                  ↑ CSS เทียบกับ data-[invalid=true] → ไม่ match
                                    label ไม่แดง โดยไม่มี error ไม่มี warning
```

**`!!` ไม่ใช่การเช็ค มันคือการแปลง** — ใช้ตอน boolean เป็น *ผลลัพธ์* ไม่ใช่ตอนเป็น *เงื่อนไข*

```js
if (error) { ... }        // ← เงื่อนไข ไม่ต้องใช้ !!
aria-invalid={!!error}    // ← ผลลัพธ์ ต้องใช้
```

เขียน `error ? true : false` ก็ได้ผลเหมือนกัน **แต่ oxlint ห้าม** (`no-unneeded-ternary` — ternary แปลงเป็น boolean ไปแล้วเพื่อเลือกกิ่ง แล้วเราเขียนผลซ้ำด้วยมือ)

`Boolean(error)` ให้ผลเหมือน `!!error` ทุกกรณี **โปรเจกต์นี้ใช้ `!!`** เพราะ `field.tsx` ที่ shadcn generate ก็เขียน `!!` (ถ้าเปิดกฎ `no-implicit-coercion` ที่ห้าม `!!` ไฟล์ของ shadcn จะ error ทุกครั้งที่ regenerate)

### ที่ไม่ควรเอาท่านี้ไปใช้

| กรณี | ใช้อะไรแทน |
| --- | --- |
| checkbox / switch (label อยู่ขวา เรียงแนวนอน) | `Field orientation="horizontal"` |
| radio group / checkbox group (1 คำถาม หลาย control) | `FieldSet` + `FieldLegend` |

radio group **ไม่ใช่ `<label for>`** — ยัดเข้าท่าข้างบนจะได้ markup ที่ดูถูกแต่ผิดสำหรับ screen reader

---

## 10. กับดักรวม

- **ห้าม `{...field} {...register(...)}` ในช่องเดียวกัน** — ลงทะเบียนซ้ำ
- **`errors.name` ไม่ใช่ string** ต้อง `.message`
- **อย่าลืม `noValidate` บน `<form>`** ไม่งั้น browser จะเด้ง validation ของตัวเองแข่งกับ zod
- **ส่ง object ให้ attribute ที่ต้องการ boolean** → ได้ `"[object Object]"` ที่ CSS ไม่ match และไม่มีอะไรเตือน
- **`FieldError` รับทั้ง `children` และ `errors` แต่ `children` ชนะเงียบๆ** — เลือกท่าเดียวทั้งไฟล์
- **`defaultValues` ที่หายไปไม่ทำให้อะไรแดง** จนกว่าจะเริ่มใช้ `isDirty`/`reset` แล้วมันจะเงียบๆ ตอบผิด

---

## อ้างอิงในโปรเจกต์

- `client/src/components/CreateUserForm.tsx` — ฟอร์มเต็มรูปแบบ: schema, mutation, `setError`, 3 fields
- `client/src/pages/LoginPage.tsx` — ฟอร์มที่ error ไปลง `ErrorDialog` แทน `errors.root`
- `client/src/components/ui/field.tsx` — ตัว `Field` ทั้งชุด (generated, ห้ามแก้)
- `client/CLAUDE.md` — convention ที่ตกลงกันแล้ว (ส่วน **Forms** และ **One field = …**)
- `CLAUDE.md` → **Known gaps** — แถว `aria-describedby`
- โน้ตใกล้เคียง: `tanstack-query.md` (`useMutation` + `invalidateQueries` ที่ฟอร์มนี้ใช้) · `axios.md`
