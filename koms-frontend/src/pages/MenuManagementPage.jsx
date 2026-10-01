import MenuImageInput from "../components/MenuImageInput";
import { useEffect, useState } from "react";
import {
  createCategory,
  createMenuItem,
  listCategories,
  listMenuItems,
  toggleMenuItemAvailability,
  uploadMenuImage,
  updateCategory,
  updateMenuItem,
} from "../api/menu.api";
import { getMenuImage, handleImageFallback } from "../utils/menuImage";

const initialItem = {
  name: "",
  price: "",
  category: "",
  description: "",
  imageFile: null,
  prepTimeMinutes: "",
};

function MenuManagementPage() {
  const [categories, setCategories] = useState([]);
  const [items, setItems] = useState([]);
  const [categoryForm, setCategoryForm] = useState({ name: "", displayOrder: "0", imageFile: null });
  const [itemForm, setItemForm] = useState(initialItem);
  const [loading, setLoading] = useState(true);
  const [creatingCategory, setCreatingCategory] = useState(false);
  const [creatingItem, setCreatingItem] = useState(false);
  const [togglingId, setTogglingId] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [editingImageId, setEditingImageId] = useState("");
  const [imageFile, setImageFile] = useState(null);
  const [uploadingImageId, setUploadingImageId] = useState("");

  const loadMenu = async () => {
    setLoading(true);
    setError("");
    try {
      const [categoryResponse, itemResponse] = await Promise.all([listCategories(), listMenuItems()]);
      setCategories(categoryResponse.data);
      setItems(itemResponse.data);
    } catch (requestError) {
      setError(requestError.response?.data?.message || "Unable to load the menu.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const initialLoad = window.setTimeout(() => {
      void loadMenu();
    }, 0);

    return () => window.clearTimeout(initialLoad);
  }, []);

  const handleCreateCategory = async (event) => {
    event.preventDefault();
    setCreatingCategory(true);
    setError("");
    setNotice("");
    try {
      if (!categoryForm.imageFile) throw new Error("Choose a category image first.");
      const uploadResponse = await uploadMenuImage(categoryForm.imageFile);
      await createCategory({ name: categoryForm.name, displayOrder: Number(categoryForm.displayOrder), imageUrl: uploadResponse.data.imageUrl });
      setCategoryForm({ name: "", displayOrder: "0", imageFile: null });
      await loadMenu();
      setNotice("Category and photo saved.");
    } catch (requestError) {
      setError(requestError.response?.data?.message || requestError.message || "Unable to create category.");
    } finally {
      setCreatingCategory(false);
    }
  };

  const handleCreateItem = async (event) => {
    event.preventDefault();
    setCreatingItem(true);
    setError("");
    setNotice("");
    try {
      if (!itemForm.imageFile) throw new Error("Choose an item image first.");
      const uploadResponse = await uploadMenuImage(itemForm.imageFile);
      await createMenuItem({
        ...itemForm,
        imageFile: undefined,
        imageUrl: uploadResponse.data.imageUrl,
        price: Number(itemForm.price),
        prepTimeMinutes: Number(itemForm.prepTimeMinutes || 0),
      });
      setItemForm(initialItem);
      await loadMenu();
      setNotice("Menu item and photo saved.");
    } catch (requestError) {
      setError(requestError.response?.data?.message || requestError.message || "Unable to create menu item.");
    } finally {
      setCreatingItem(false);
    }
  };

  const handleToggleAvailability = async (item) => {
    setTogglingId(item._id);
    setError("");
    try {
      const response = await toggleMenuItemAvailability(item._id, !item.isAvailable);
      setItems((previous) => previous.map((current) => (
        current._id === item._id
          ? { ...current, ...response.data, category: current.category }
          : current
      )));
    } catch (requestError) {
      setError(requestError.response?.data?.message || "Unable to update availability.");
    } finally {
      setTogglingId("");
    }
  };

  const itemsForCategory = (categoryId) => items.filter((item) => {
    const itemCategoryId = typeof item.category === "string" ? item.category : item.category?._id;
    return itemCategoryId === categoryId;
  });

  const saveImage = async (entity, id) => {
    setError("");
    setNotice("");
    setUploadingImageId(`${entity}:${id}`);
    try {
      if (!imageFile) throw new Error("Choose an image file first.");
      const uploadResponse = await uploadMenuImage(imageFile);
      if (entity === "category") await updateCategory(id, { imageUrl: uploadResponse.data.imageUrl });
      else await updateMenuItem(id, { imageUrl: uploadResponse.data.imageUrl });
      setEditingImageId("");
      setImageFile(null);
      await loadMenu();
      setNotice("Photo updated successfully.");
    } catch (requestError) {
      setError(requestError.response?.data?.message || requestError.message || "Unable to save the image.");
    } finally {
      setUploadingImageId("");
    }
  };

  return (
    <main className="page-shell">
      <header className="page-header">
        <div><p className="eyebrow">Restaurant setup</p><h1>Menu management</h1></div>
        <button type="button" className="button secondary" onClick={loadMenu}>Refresh menu</button>
      </header>
      {error && <p className="error" role="alert">{error}</p>}
      {notice && <p className="success" role="status">{notice}</p>}
      {loading ? <p>Loading menu...</p> : (
        <div className="menu-layout">
          <section className="panel">
            <h2>Categories</h2>
            <form className="inline-form" onSubmit={handleCreateCategory}>
              <input aria-label="Category name" value={categoryForm.name} onChange={(event) => setCategoryForm({ ...categoryForm, name: event.target.value })} placeholder="Category name" required />
              <input aria-label="Display order" type="number" min="0" value={categoryForm.displayOrder} onChange={(event) => setCategoryForm({ ...categoryForm, displayOrder: event.target.value })} />
              <MenuImageInput label="Category image" file={categoryForm.imageFile} onChange={file => setCategoryForm({ ...categoryForm, imageFile: file })} />
              {categoryForm.imageFile && <small className="file-selected">Selected photo: {categoryForm.imageFile.name}</small>}
              <button className="button" type="submit" disabled={creatingCategory}>{creatingCategory ? "Adding..." : "Add category"}</button>
            </form>
            {categories.length === 0 ? <p>No categories yet.</p> : <ul className="simple-list">{categories.map((category) => <li key={category._id}><img className="menu-thumb" src={getMenuImage(null, category)} alt="" onError={handleImageFallback} /><div><strong>{category.name}</strong><span>Order {category.displayOrder}</span></div><button type="button" className="text-button" onClick={() => { setEditingImageId(`category:${category._id}`); setImageFile(null); }}>Replace photo</button>{editingImageId === `category:${category._id}` && <form className="image-url-editor" onSubmit={(event) => { event.preventDefault(); void saveImage("category", category._id); }}><MenuImageInput label={`${category.name} image file`} file={imageFile} onChange={setImageFile} />{error && <p className="error" role="alert">{error}</p>}{imageFile && <small className="file-selected">Ready: {imageFile.name}</small>}<button className="button secondary" type="submit" disabled={!imageFile || uploadingImageId === `category:${category._id}`}>{uploadingImageId === `category:${category._id}` ? "Uploading..." : "Upload photo"}</button></form>}</li>)}</ul>}
          </section>

          <section className="panel">
            <h2>Add item</h2>
            {categories.length === 0 ? <p>Create a category before adding menu items.</p> : (
              <form className="form-grid" onSubmit={handleCreateItem}>
                <label>Name<input value={itemForm.name} onChange={(event) => setItemForm({ ...itemForm, name: event.target.value })} required /></label>
                <label>Price<input type="number" min="0" step="0.01" value={itemForm.price} onChange={(event) => setItemForm({ ...itemForm, price: event.target.value })} required /></label>
                <label>Category<select value={itemForm.category} onChange={(event) => setItemForm({ ...itemForm, category: event.target.value })} required><option value="">Select category</option>{categories.map((category) => <option key={category._id} value={category._id}>{category.name}</option>)}</select></label>
                <label>Prep time (minutes)<input type="number" min="0" value={itemForm.prepTimeMinutes} onChange={(event) => setItemForm({ ...itemForm, prepTimeMinutes: event.target.value })} /></label>
                <label className="full-width">Description<textarea value={itemForm.description} onChange={(event) => setItemForm({ ...itemForm, description: event.target.value })} /></label>
                <label className="full-width">Item image<MenuImageInput label="Item image" file={itemForm.imageFile} onChange={file => setItemForm({ ...itemForm, imageFile: file })} /></label>
                {itemForm.imageFile && <small className="file-selected full-width">Selected photo: {itemForm.imageFile.name}</small>}
                <button className="button" type="submit" disabled={creatingItem}>{creatingItem ? "Adding..." : "Add item"}</button>
              </form>
            )}
          </section>

          <section className="panel menu-items-panel">
            <h2>Items by category</h2>
            {categories.length === 0 ? <p>No menu items yet.</p> : categories.map((category) => {
              const categoryItems = itemsForCategory(category._id);
              return <div className="category-group" key={category._id}><h3>{category.name}</h3>{categoryItems.length === 0 ? <p>No items in this category.</p> : <ul className="item-list">{categoryItems.map((item) => <li key={item._id}><img className="menu-thumb" src={getMenuImage(item, category)} alt="" onError={handleImageFallback} /><div><strong>{item.name}</strong><span>NPR {Number(item.price).toFixed(2)} · {item.isAvailable ? "Available" : "Unavailable"}</span></div><button type="button" className="text-button" onClick={() => { setEditingImageId(`item:${item._id}`); setImageFile(null); }}>Replace photo</button><button type="button" className="button secondary" disabled={togglingId === item._id} onClick={() => handleToggleAvailability(item)}>{togglingId === item._id ? "Updating..." : item.isAvailable ? "Mark unavailable" : "Mark available"}</button>{editingImageId === `item:${item._id}` && <form className="image-url-editor" onSubmit={(event) => { event.preventDefault(); void saveImage("item", item._id); }}><MenuImageInput label={`${item.name} image file`} file={imageFile} onChange={setImageFile} />{error && <p className="error" role="alert">{error}</p>}{imageFile && <small className="file-selected">Ready: {imageFile.name}</small>}<button className="button secondary" type="submit" disabled={!imageFile || uploadingImageId === `item:${item._id}`}>{uploadingImageId === `item:${item._id}` ? "Uploading..." : "Upload photo"}</button></form>}</li>)}</ul>}</div>;
            })}
          </section>
        </div>
      )}
    </main>
  );
}

export default MenuManagementPage;
